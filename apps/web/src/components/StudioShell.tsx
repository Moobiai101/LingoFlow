import { useEffect, useRef, useState, type FormEvent } from "react";
import { useConversation } from "@elevenlabs/react";
import { ConnectionStatus, type ConnectionState } from "./ConnectionStatus";
import {
  assessPractice,
  connectVoice,
  postEvidence,
  postTransfer,
  refreshLearnerSession,
  replayPhrase,
  type LearnerSession,
  type PracticeResult,
} from "./learner-state";
import { Button, Divider, Icon, Kicker, StatusDot } from "../design-system/primitives";

type Speaker = "coach" | "learner";
type Panel = "none" | "practice" | "review" | "transfer";
type VoiceState = "offline" | "connecting" | "connected" | "rate_limited";

type ConversationMessage = {
  readonly id: string;
  readonly speaker: Speaker;
  readonly label: string;
  readonly body: string;
  readonly time: string;
  readonly highlighted?: string;
};

const conversationFixture: readonly ConversationMessage[] = [
  { id: "prompt", speaker: "coach", label: "Maya · coach", body: "Tell me about a small win you had this week.", time: "10:42" },
  { id: "reply", speaker: "learner", label: "You", body: "I finally spoke up in a meeting. I was nervous, but it felt good to share my idea.", time: "10:43", highlighted: "spoke up" },
  { id: "feedback", speaker: "coach", label: "Maya · coach", body: "That sounds like a real win. What helped you feel ready to speak?", time: "10:43" },
];

const MAX_VISIBLE_MESSAGES = 120;
const MAX_SEEN_VOICE_EVENTS = MAX_VISIBLE_MESSAGES * 2;

function clientMessageId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function appendMessage(current: readonly ConversationMessage[], message: ConversationMessage): readonly ConversationMessage[] {
  return [...current, message].slice(-MAX_VISIBLE_MESSAGES);
}

function MessageBody({ message }: { message: ConversationMessage }) {
  if (!message.highlighted) return <>{message.body}</>;
  const [before, after] = message.body.split(message.highlighted);
  return <>{before}<mark>{message.highlighted}</mark>{after}</>;
}

function phraseTextFor(itemId: string): string {
  if (itemId === "phrase-because") return "because";
  return "Could I have water?";
}

function VoiceButton({ state, onChange }: { state: VoiceState; onChange: () => void }) {
  const label = state === "connected"
    ? "End voice practice"
    : state === "connecting"
      ? "Connecting voice practice"
      : state === "rate_limited"
        ? "Voice is rate limited; try again later"
      : "Connect voice practice";
  return (
    <button
      aria-label={label}
      aria-pressed={state === "connected"}
      className={`voice-button ${state === "connecting" ? "voice-button--connecting" : ""} ${state === "connected" ? "voice-button--listening" : ""}`}
      disabled={state === "connecting"}
      onClick={onChange}
      type="button"
    >
      <Icon name="mic" size={21} />
    </button>
  );
}

function ActionDock({
  state,
  hint,
  onVoiceChange,
  onReplay,
  onReply,
}: {
  state: VoiceState;
  hint?: string;
  onVoiceChange: () => void;
  onReplay: () => void;
  onReply: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    onReply(draft.trim());
    setDraft("");
  }

  return (
    <div className="action-dock-wrap">
      <form className="action-dock" onSubmit={handleSubmit}>
        <VoiceButton onChange={onVoiceChange} state={state} />
        <label className="sr-only" htmlFor="practice-note">Write a reply</label>
        <input
          id="practice-note"
          onChange={(event) => setDraft(event.target.value)}
          placeholder={state === "connected" ? "Voice is ready, or write a reply…" : "Write what you would say…"}
          value={draft}
        />
        <div className="action-dock__actions">
          <button aria-label="Play latest coach message" className="dock-icon-button" onClick={onReplay} type="button">
            <Icon name="play" size={16} />
          </button>
          <button aria-label="Send written reply" className="send-button" disabled={!draft.trim()} type="submit">
            <Icon name="arrow-up-right" size={17} />
          </button>
        </div>
      </form>
      <p className="action-dock__hint">
        <Icon name="headphones" size={14} />
        {hint ?? (state === "connected" ? "Live voice connected. End or reconnect any time." : "Voice is optional. Offline transcript practice stays text-only.")}
      </p>
    </div>
  );
}

function practiceFeedback(result: PracticeResult): string {
  const feedback = result.feedback?.join(" ");
  if (result.queued) return feedback ?? "Saved locally. It will sync when the API is available.";
  if (feedback) return result.saved ? feedback : `Not saved yet: ${feedback}`;
  if (result.status === "complete") return "The offline transcript matched the target phrase.";
  if (result.status === "failed") return "No transcript was received.";
  return "The offline assessor could not confirm an exact match. Try once more.";
}

function PracticePanel({
  state,
  itemId,
  onClose,
  onSaved,
}: {
  state: LearnerSession;
  itemId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const expected = phraseTextFor(itemId);
  const [attempt, setAttempt] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function assess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const observed = attempt.trim();
    if (!observed || isSubmitting) return;
    setIsSubmitting(true);
    const result = await assessPractice(state, {
      itemId,
      observed,
      requestId: `practice-${state.sessionId}-${itemId}-${Date.now()}`,
    });
    setFeedback(practiceFeedback(result));
    setIsSubmitting(false);
    if (result.saved) onSaved();
  }

  return (
    <section aria-labelledby="practice-panel-title" className="practice-panel studio-panel">
      <div className="studio-panel__heading">
        <div><Kicker>Phrase practice</Kicker><h2 id="practice-panel-title">Practice this: <span>{expected}</span></h2></div>
        <button aria-label="Close phrase practice" className="icon-button" onClick={onClose} type="button">×</button>
      </div>
      <p className="offline-label"><Icon name="text-cursor" size={15} /> Offline transcript assessment · text feedback only</p>
      <p className="studio-panel__note">This panel does not use your microphone and does not score phonemes. Write the phrase the way you would say it.</p>
      <form className="transcript-form" onSubmit={assess}>
        <label htmlFor="transcript-attempt">Your transcript</label>
        <textarea id="transcript-attempt" onChange={(event) => setAttempt(event.target.value)} placeholder={expected} value={attempt} />
        <div className="transcript-form__footer">
          <span>{feedback || "No score is invented while you practice offline."}</span>
          <Button disabled={!attempt.trim() || isSubmitting} icon="arrow-up-right" size="sm" variant="accent">
            {isSubmitting ? "Checking…" : "Check my wording"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function ReviewPanel({
  state,
  onClose,
  onReview,
}: {
  state: LearnerSession;
  onClose: () => void;
  onReview: (itemId: string) => void;
}) {
  return (
    <section aria-labelledby="review-panel-title" className="studio-panel review-panel">
      <div className="studio-panel__heading">
        <div><Kicker>Review queue</Kicker><h2 id="review-panel-title">Small loops, lasting change.</h2></div>
        <button aria-label="Close review queue" className="icon-button" onClick={onClose} type="button">×</button>
      </div>
      <div className="review-panel__grid"><div><p className="review-count">{state.reviewItems.length.toString().padStart(2, "0")}</p><span>items ready</span></div><p>Start with the phrase that keeps asking for your attention. A short retry is enough.</p></div>
      {state.reviewItems.length ? (
        <ul className="review-list">
          {state.reviewItems.map((item) => (
            <li key={item.id}>
              <span className={`priority-dot priority-dot--${item.priority}`} />
              <div><strong>{phraseTextFor(item.itemId)}</strong><span>{item.skillId} · {item.reason.replaceAll("_", " ")}</span></div>
              <button className="text-button" onClick={() => onReview(item.itemId)} type="button">Review <Icon name="arrow-up-right" size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="studio-panel__note">Nothing is due yet. A saved practice attempt will create the next review signal.</p>}
    </section>
  );
}

function TransferPanel({ state, onClose, onSaved }: { state: LearnerSession; onClose: () => void; onSaved: () => void }) {
  const [attempt, setAttempt] = useState("");
  const [result, setResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = attempt.trim();
    if (!text || isSubmitting) return;
    setIsSubmitting(true);
    const assessment = await postTransfer(state, {
      id: `transfer-${state.sessionId}-${Date.now()}`,
      itemId: "phrase-could-i",
      skillId: "polite questions",
      original: { intent: "ask for water", surface: "cafe" },
      attempt: { intent: "ask for directions", surface: "station", text },
      outcome: "uncertain",
    });
    const outcome = assessment && typeof assessment === "object" && "outcome" in assessment
      ? String((assessment as { outcome?: unknown }).outcome)
      : undefined;
    const queued = assessment && typeof assessment === "object" && "queued" in assessment;
    setResult(queued
      ? "Saved locally. The transfer will sync when the API is available."
      : outcome === "success"
      ? "Transfer spotted: the polite shape held up in a new situation."
      : assessment
        ? "Saved as an uncertain transfer. Try carrying the polite shape into one more situation."
        : "The transfer could not be saved yet. Reconnect the studio and try again.");
    setIsSubmitting(false);
    if (assessment && !queued) onSaved();
  }

  return (
    <section aria-labelledby="transfer-panel-title" className="studio-panel transfer-panel">
      <div className="studio-panel__heading">
        <div><Kicker>Carry it with you</Kicker><h2 id="transfer-panel-title">Ask for directions at a station.</h2></div>
        <button aria-label="Close transfer practice" className="icon-button" onClick={onClose} type="button">×</button>
      </div>
      <p className="studio-panel__note">Same intention, new setting. Write one sentence using the polite question shape from today.</p>
      <form className="transcript-form" onSubmit={submit}>
        <label htmlFor="transfer-attempt">Your new situation</label>
        <textarea id="transfer-attempt" onChange={(event) => setAttempt(event.target.value)} placeholder="Could I have directions to the station?" value={attempt} />
        <div className="transcript-form__footer"><span>{result || "A transfer is a new situation—not a perfection test."}</span><Button disabled={!attempt.trim() || isSubmitting} icon="arrow-up-right" size="sm" variant="accent">{isSubmitting ? "Saving…" : "Save result"}</Button></div>
      </form>
    </section>
  );
}

function SignalRail({
  state,
  onPanel,
  onPractice,
}: {
  state: LearnerSession;
  onPanel: (panel: Panel) => void;
  onPractice: (itemId: string) => void;
}) {
  const topSkill = state.skills[0];
  const topPhraseId = topSkill?.skillId === "connecting ideas" ? "phrase-because" : "phrase-could-i";
  return (
    <aside aria-label="Conversation signals" className="signal-rail">
      <div className="signal-rail__heading"><div><Kicker>Signal rail</Kicker><h2>Stay curious</h2></div><button aria-label="Signal rail options" className="icon-button" type="button"><Icon name="more" /></button></div>
      <section className="signal-card signal-card--warm"><div className="signal-card__topline"><span className="signal-card__label"><StatusDot tone="warm" /> Try this</span><span className="signal-card__index">01</span></div><h3>{topSkill ? `Give your ${topSkill.skillId} a little more room.` : "Give your idea a little more room."}</h3><p>Use <strong>because</strong> to connect your thought to a reason.</p><button className="text-button" onClick={() => onPractice(topPhraseId)} type="button">Practice this <Icon name="arrow-up-right" size={15} /></button></section>
      <section aria-labelledby="mistake-map-title" className="mistake-map"><div className="signal-card__topline"><span className="phrase-card__label"><Icon name="waveform" size={15} /> Mistake map</span><span className="coming-soon">Live view</span></div><h3 id="mistake-map-title">Where to spend a minute</h3><div className="skill-bars">{state.skills.slice(0, 3).map((skill) => <div className="skill-bar" key={skill.skillId}><div><span>{skill.skillId}</span><small>{skill.errorCount ? `${skill.errorCount} signal${skill.errorCount === 1 ? "" : "s"}` : "steady"}</small></div><span className="skill-bar__track"><span style={{ width: `${Math.min(100, Math.max(14, skill.priorityScore * 18))}%` }} /></span></div>)}</div><p>Patterns, not grades. The map only shows what to revisit next.</p></section>
      <section className="phrase-card"><div className="phrase-card__topline"><span className="phrase-card__label"><Icon name="book-open" size={15} /> Review queue</span><span className="queue-count">{state.reviewItems.length.toString().padStart(2, "0")}</span></div><h3>{state.reviewItems.length ? `${state.reviewItems.length} small loop${state.reviewItems.length === 1 ? "" : "s"} ready.` : "Your queue is clear."}</h3><p>Return to the phrases that deserve another gentle try.</p><button className="text-button" onClick={() => onPanel("review")} type="button">Open review queue <Icon name="arrow-up-right" size={15} /></button></section>
      <section className="transfer-card"><div className="signal-card__topline"><span className="phrase-card__label"><Icon name="compass" size={15} /> Transfer</span><span className="coming-soon">Next step</span></div><h3>Use today&apos;s shape somewhere new.</h3><p>Try the idea at a station instead of a cafe.</p><button className="text-button" onClick={() => onPanel("transfer")} type="button">Try a new situation <Icon name="arrow-up-right" size={15} /></button></section>
      <div className="signal-rail__tip"><Icon name="spark" size={17} /><p><strong>One gentle nudge</strong> at a time keeps practice moving.</p></div>
    </aside>
  );
}

function connectionState(state: VoiceState): ConnectionState {
  if (state === "connected") return "connected";
  if (state === "connecting") return "connecting";
  if (state === "rate_limited") return "rate_limited";
  return "offline";
}

export function StudioShell({
  state,
  onStateChange,
}: {
  state: LearnerSession;
  onStateChange?: (state: LearnerSession) => void;
}) {
  const [voiceState, setVoiceState] = useState<VoiceState>("offline");
  const [voiceNotice, setVoiceNotice] = useState("");
  const [panel, setPanel] = useState<Panel>("none");
  const [activePhraseId, setActivePhraseId] = useState("phrase-could-i");
  const [messages, setMessages] = useState<readonly ConversationMessage[]>(conversationFixture);
  const seenVoiceEvents = useRef<Set<string>>(new Set());
  const initials = state.profile.displayName.slice(0, 2).toUpperCase() || "LF";

  const conversation = useConversation({
    onConnect: () => {
      setVoiceState("connected");
      setVoiceNotice("Live voice connected. Speak naturally; the tutor will keep the next correction small.");
    },
    onDisconnect: (details) => {
      setVoiceState("offline");
      setVoiceNotice(details.reason === "error" ? "Live voice disconnected. Continue with text practice or reconnect." : "Voice session ended. Reconnect any time.");
    },
    onError: (message) => {
      setVoiceState("offline");
      setVoiceNotice(`Live voice unavailable: ${message}`);
    },
    onMessage: ({ event_id: eventId, message, role, source }) => {
      const speaker: Speaker = role === "user" || source === "user" ? "learner" : "coach";
      const id = `voice-${eventId}-${speaker}`;
      if (seenVoiceEvents.current.has(id)) return;
      seenVoiceEvents.current.add(id);
      while (seenVoiceEvents.current.size > MAX_SEEN_VOICE_EVENTS) {
        const oldest = seenVoiceEvents.current.values().next().value;
        if (typeof oldest !== "string") break;
        seenVoiceEvents.current.delete(oldest);
      }
      setMessages((current) => appendMessage(current, { id, speaker, label: speaker === "learner" ? "You" : "Maya · coach", body: message, time: "now" }));
      if (speaker === "learner") {
        void postEvidence(state, {
          id: `evidence-voice-${state.sessionId}-${eventId}`,
          itemId: "conversation-small-win",
          skillId: "confidence",
          type: "attempted",
          expected: "Share a small win",
          observed: message,
          outcome: "uncertain",
          confidence: 0.5,
          source: "conversation",
          context: { surface: "live_voice_transcript" },
          createdAt: new Date().toISOString(),
        });
      }
    },
  });
  const conversationStatus = useRef(conversation.status);

  useEffect(() => {
    conversationStatus.current = conversation.status;
    if (conversation.status === "connected") setVoiceState("connected");
    if (conversation.status === "connecting") setVoiceState("connecting");
    if (conversation.status === "error" || conversation.status === "disconnected") setVoiceState("offline");
  }, [conversation.status]);

  useEffect(() => () => {
    if (conversationStatus.current !== "disconnected") void conversation.endSession();
  }, [conversation.endSession]);

  async function toggleVoice() {
    if (voiceState === "connecting") return;
    if (conversation.status === "connected") {
      conversation.endSession();
      setVoiceState("offline");
      setVoiceNotice("Voice session ended. Reconnect any time.");
      return;
    }

    setVoiceState("connecting");
    setVoiceNotice("Preparing the conversation line…");
    const result = await connectVoice(state, activePhraseId);
    if (result.mode !== "live" || result.fallback || !result.signedUrl) {
      setVoiceState(result.fallbackDetails?.code === "rate_limited" ? "rate_limited" : "offline");
      setVoiceNotice(result.fallbackDetails?.message ?? "Offline text practice is ready. Add live credentials for microphone sessions.");
      return;
    }

    conversation.startSession({
      signedUrl: result.signedUrl,
      connectionType: "websocket",
      userId: state.learnerId,
      ...(result.context?.dynamicVariables ? { dynamicVariables: result.context.dynamicVariables } : {}),
      ...(result.context?.systemPrompt ? { overrides: { agent: { prompt: { prompt: result.context.systemPrompt } } } } : {}),
    });
    setVoiceNotice("Microphone permission may be requested by your browser.");
  }

  async function refreshState() {
    if (onStateChange) onStateChange(await refreshLearnerSession(state));
  }

  function addReply(text: string) {
    if (conversation.status === "connected") {
      conversation.sendUserMessage(text);
      return;
    }
    setMessages((current) => appendMessage(current, { id: clientMessageId("reply"), speaker: "learner", label: "You", body: text, time: "now" }));
    void postEvidence(state, {
      id: `evidence-text-${state.sessionId}-${Date.now()}`,
      itemId: "conversation-small-win",
      skillId: "confidence",
      type: "attempted",
      expected: "Share a small win",
      observed: text,
      outcome: "uncertain",
      confidence: 0.5,
      source: "conversation",
      context: { surface: "text_reply" },
      createdAt: new Date().toISOString(),
    }).then((saved) => { if (saved) void refreshState(); });
  }

  async function replayLatest() {
    const result = await replayPhrase(state, activePhraseId, phraseTextFor(activePhraseId));
    setVoiceNotice(result.message);
  }

  function openPractice(itemId: string) {
    setActivePhraseId(itemId);
    setPanel("practice");
  }

  return (
    <main className="studio-layout" aria-label="Conversation studio">
      <aside className="studio-sidebar">
        <div className="sidebar-heading"><div className="brand-lockup" aria-label="LingoFlow home"><span className="brand-mark">L</span><span>LingoFlow</span></div><button aria-label="Open studio menu" className="icon-button icon-button--subtle" type="button"><Icon name="sliders" size={17} /></button></div>
        <div className="sidebar-profile"><div className="avatar">{initials}</div><div><strong>{state.profile.displayName}&apos;s studio</strong><span>{state.profile.goal === "everyday" ? "Everyday conversation" : state.profile.goal === "work" ? "Work and meetings" : "Travel confidence"}</span></div><Icon name="chevron-down" size={15} /></div>
        <nav aria-label="Studio navigation" className="studio-nav"><Kicker>Your space</Kicker><button className="studio-nav__item studio-nav__item--active" type="button"><Icon name="waveform" size={18} /><span>Practice studio</span><span className="nav-count">01</span></button><div className="studio-nav__item studio-nav__item--static"><Icon name="spark" size={18} /><span>Practice focus</span><span className="nav-count">{state.skills[0]?.skillId ?? "ready"}</span></div><button className="studio-nav__item" onClick={() => setPanel("review")} type="button"><Icon name="book-open" size={18} /><span>Review queue</span><span className="nav-count">{state.reviewItems.length.toString().padStart(2, "0")}</span></button></nav>
        <div className="sidebar-bottom"><div className="streak-card"><div className="streak-card__copy"><Kicker>Keep the thread</Kicker><strong>3 day streak</strong></div><span className="streak-flame">✦</span></div><ConnectionStatus onReconnect={toggleVoice} state={connectionState(voiceState)} /><p className="sidebar-footer">Built for small, consistent wins.</p></div>
      </aside>
      <section className="studio-main">
        <header className="studio-main__header"><div className="session-breadcrumb"><span>Practice studio</span><Icon name="arrow-up-right" size={13} /><strong>Small wins</strong></div><div className="studio-main__header-actions"><ConnectionStatus compact state={connectionState(voiceState)} /><Divider /><button aria-label="Session options" className="icon-button" type="button"><Icon name="more" /></button></div></header>
        <div className="studio-main__body">
          <div className="conversation-column">
            <div className="session-intro"><div><Kicker>Wednesday · 10:42 AM</Kicker><h1>A little more like you.</h1><p>A five-minute conversation about the moments you&apos;re proud of.</p></div><div className="session-meta"><span><Icon name="clock" size={14} /> 04:12</span><span><Icon name="sound" size={14} /> {state.profile.personality === "patient" ? "Calm pace" : state.profile.personality === "energetic" ? "Bright pace" : "Clear pace"}</span></div></div>
            <div className="conversation-lane" aria-label="Conversation with Maya"><div className="conversation-lane__line" aria-hidden="true" />{messages.map((message) => <article className={`message message--${message.speaker}`} key={message.id}><div className="message__avatar" aria-hidden="true">{message.speaker === "coach" ? <span>M</span> : <span>{initials}</span>}</div><div className="message__content"><div className="message__meta"><span>{message.label}</span><time>{message.time}</time></div><p><MessageBody message={message} /></p>{message.id === "reply" ? <div className="message__actions"><span className="message__signal"><StatusDot tone="active" /> Natural phrasing</span><button className="text-button" onClick={() => openPractice("phrase-could-i")} type="button">Practice this <Icon name="arrow-up-right" size={14} /></button></div> : null}</div></article>)}<div className="conversation-lane__next"><span className="conversation-lane__next-dot" /><span>{voiceState === "connected" ? "Maya is listening for your next thought" : "Your next thought can be written or spoken"}</span></div></div>
            {panel === "practice" ? <PracticePanel itemId={activePhraseId} onClose={() => setPanel("none")} onSaved={refreshState} state={state} /> : null}
            {panel === "review" ? <ReviewPanel onClose={() => setPanel("none")} onReview={openPractice} state={state} /> : null}
            {panel === "transfer" ? <TransferPanel onClose={() => setPanel("none")} onSaved={refreshState} state={state} /> : null}
            <ActionDock hint={voiceNotice || undefined} onReplay={() => void replayLatest()} onReply={addReply} onVoiceChange={() => void toggleVoice()} state={voiceState} />
          </div>
          <SignalRail onPanel={setPanel} onPractice={openPractice} state={state} />
        </div>
      </section>
    </main>
  );
}
