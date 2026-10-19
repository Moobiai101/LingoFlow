import { useState, type FormEvent } from "react";
import { ConnectionStatus, type ConnectionState } from "./ConnectionStatus";
import {
  assessPractice,
  postEvidence,
  postTransfer,
  refreshLearnerSession,
  replayPhrase,
  type LearnerSession,
  type PracticeResult,
} from "./learner-state";
import { useLiveVoice, type LiveVoiceMessage, type LiveVoicePhase } from "./live-voice";
import { TutorCharacter, type TutorCharacterState } from "./TutorCharacter";
import { Button, Icon, Kicker, StatusDot } from "../design-system/primitives";

type Speaker = "coach" | "learner";
type Panel = "none" | "practice" | "review" | "transfer";

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

function phraseTranslationFor(itemId: string): string {
  if (itemId === "phrase-because") return "क्योंकि";
  return "क्या मुझे पानी मिल सकता है?";
}

function VoiceButton({ phase, onChange }: { phase: LiveVoicePhase; onChange: () => void }) {
  const label = phase === "connected"
    ? "End voice practice"
    : phase === "connecting"
      ? "Connecting voice practice"
      : phase === "ending"
        ? "Ending voice practice"
        : phase === "text_fallback"
          ? "Try live voice again"
          : "Start voice practice";
  const isBusy = phase === "connecting" || phase === "ending";
  return (
    <button
      aria-label={label}
      aria-pressed={phase === "connected"}
      className={`voice-button voice-button--${phase}`}
      disabled={isBusy}
      onClick={onChange}
      type="button"
    >
      <span className="voice-button__ring" aria-hidden="true" />
      <Icon name="mic" size={27} />
      <span className="sr-only">{phase === "connected" ? "End voice practice" : "Start voice practice"}</span>
    </button>
  );
}

function voiceCopy(phase: LiveVoicePhase, isSpeaking: boolean, isListening: boolean): { title: string; detail: string } {
  if (phase === "connecting") return { title: "Finding your conversation line", detail: "Microphone permission may appear next." };
  if (phase === "ending") return { title: "Closing the conversation", detail: "Your notes stay safe in this studio." };
  if (phase === "text_fallback") return { title: "Text practice is ready", detail: "Live voice is taking a pause. You can keep going here." };
  if (phase === "connected" && isSpeaking) return { title: "Maya is speaking", detail: "Listen for one small, useful phrase." };
  if (phase === "connected" && isListening) return { title: "Maya is listening", detail: "Take your time. There is no rush." };
  if (phase === "connected") return { title: "Your turn", detail: "Say it in your own words." };
  return { title: "Ready when you are", detail: "Start a gentle five-minute voice practice." };
}

function VoiceControls({
  phase,
  notice,
  isSpeaking,
  isListening,
  onVoiceChange,
  onEnd,
  onReplay,
  onReply,
}: {
  phase: LiveVoicePhase;
  notice?: string;
  isSpeaking: boolean;
  isListening: boolean;
  onVoiceChange: () => void;
  onEnd: () => void;
  onReplay: () => void;
  onReply: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const copy = voiceCopy(phase, isSpeaking, isListening);
  const isOpen = phase === "connected" || phase === "connecting" || phase === "ending";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onReply(text);
    setDraft("");
  }

  return (
    <section aria-labelledby="voice-controls-title" className={`voice-controls voice-controls--${phase}`}>
      <div className="voice-controls__heading">
        <div>
          <Kicker>Conversation line</Kicker>
          <h2 id="voice-controls-title">{copy.title}</h2>
          <p>{copy.detail}</p>
        </div>
        <span className={`voice-state-chip voice-state-chip--${phase}`} role="status">
          <StatusDot tone={phase === "connected" ? "active" : phase === "text_fallback" ? "warm" : "quiet"} />
          {phase === "connected" ? "Live" : phase === "text_fallback" ? "Text only" : phase === "connecting" || phase === "ending" ? "Working" : "Idle"}
        </span>
      </div>
      <div className="voice-controls__actions">
        <VoiceButton onChange={onVoiceChange} phase={phase} />
        {isOpen ? (
          <button aria-label="End voice session" className="voice-end-button" disabled={phase === "ending"} onClick={onEnd} type="button">
            <span className="voice-end-button__dot" aria-hidden="true" />
            {phase === "ending" ? "Ending" : "End session"}
          </button>
        ) : null}
        <button aria-label="Hear the focus phrase" className="voice-replay-button" onClick={onReplay} type="button">
          <Icon name="play" size={16} />
          <span>Hear phrase</span>
        </button>
      </div>
      <form aria-label="Text fallback" className="text-fallback" onSubmit={handleSubmit}>
        <label htmlFor="practice-note">Prefer typing?</label>
        <div className="text-fallback__input">
          <input
            id="practice-note"
            onChange={(event) => setDraft(event.target.value)}
            placeholder={phase === "connected" ? "You can also type a reply…" : "Write what you would say…"}
            value={draft}
          />
          <button aria-label="Send written reply" disabled={!draft.trim()} type="submit">
            <Icon name="arrow-up-right" size={17} />
          </button>
        </div>
      </form>
      <p aria-live="polite" className="voice-controls__notice">
        <Icon name={phase === "text_fallback" ? "cloud-off" : "headphones"} size={14} />
        {notice || (phase === "connected" ? "Microphone is on. End or reconnect any time." : "Voice is optional. Text practice works offline.")}
      </p>
    </section>
  );
}

function LiveTranscript({
  messages,
  phase,
  isListening,
  initials,
}: {
  messages: readonly ConversationMessage[];
  phase: LiveVoicePhase;
  isListening: boolean;
  initials: string;
}) {
  const visibleMessages = messages.slice(-4);
  return (
    <section aria-labelledby="live-transcript-title" className="live-transcript">
      <div className="live-transcript__heading">
        <div>
          <Kicker>Live transcript</Kicker>
          <h2 id="live-transcript-title">A few words at a time.</h2>
        </div>
        <span className="transcript-count">{messages.length.toString().padStart(2, "0")} turns</span>
      </div>
      <div aria-live="polite" className="transcript-feed">
        {visibleMessages.map((message) => (
          <article className={`transcript-line transcript-line--${message.speaker}`} key={message.id}>
            <span aria-hidden="true" className="transcript-line__avatar">{message.speaker === "coach" ? "M" : initials}</span>
            <div className="transcript-line__body">
              <div className="transcript-line__meta"><span>{message.label}</span><time>{message.time}</time></div>
              <p><MessageBody message={message} /></p>
            </div>
          </article>
        ))}
      </div>
      <p aria-live="polite" className="transcript-listening" role="status">
        <span className={`transcript-listening__dot ${isListening ? "transcript-listening__dot--active" : ""}`} aria-hidden="true" />
        {phase === "connected" && isListening ? "Listening for your next thought" : phase === "connected" ? "Your conversation is live" : "Your transcript will appear here"}
      </p>
    </section>
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

function PracticeRail({
  state,
  activePhraseId,
  onPanel,
  onPractice,
  onReplay,
}: {
  state: LearnerSession;
  activePhraseId: string;
  onPanel: (panel: Panel) => void;
  onPractice: (itemId: string) => void;
  onReplay: () => void;
}) {
  const topSkill = state.skills[0];
  return (
    <aside aria-label="Practice tools" className="practice-rail">
      <div className="practice-rail__heading">
        <div><Kicker>Keep nearby</Kicker><h2>Little language cards</h2></div>
        <span className="practice-rail__spark" aria-hidden="true">✦</span>
      </div>
      <section className="language-card language-card--focus">
        <div className="language-card__eyebrow"><span><StatusDot tone="warm" /> Today&apos;s shape</span><span>01</span></div>
        <h3>{phraseTextFor(activePhraseId)}</h3>
        <p>{phraseTranslationFor(activePhraseId)}</p>
        <span className="language-card__detail">{activePhraseId === "phrase-because" ? "Connect an idea to a reason" : "A gentle request at a cafe"}</span>
        <div className="language-card__actions"><button className="card-link" onClick={onReplay} type="button"><Icon name="play" size={14} /> Hear it</button><button className="card-link" onClick={() => onPractice(activePhraseId)} type="button">Practice <Icon name="arrow-up-right" size={14} /></button></div>
      </section>
      <section className="language-card language-card--bridge">
        <div className="language-card__eyebrow"><span><Icon name="book-open" size={14} /> Phrase bridge</span><span>{state.profile.nativeLanguage === "hi" ? "HI" : state.profile.nativeLanguage.toUpperCase()}</span></div>
        <h3>Keep the intention. Change the setting.</h3>
        <p>Use the same polite shape when you ask for directions.</p>
        <button className="card-link" onClick={() => onPanel("transfer")} type="button">Try a new situation <Icon name="arrow-up-right" size={14} /></button>
      </section>
      <section className="language-card language-card--review">
        <div className="language-card__eyebrow"><span><Icon name="waveform" size={14} /> Practice focus</span><span className="queue-count">{state.reviewItems.length.toString().padStart(2, "0")}</span></div>
        <h3>{topSkill ? `A little more ${topSkill.skillId}.` : "A little more confidence."}</h3>
        <div className="focus-bars">{state.skills.slice(0, 3).map((skill) => <div className="focus-bar" key={skill.skillId}><span>{skill.skillId}</span><span className="focus-bar__track"><span style={{ width: `${Math.min(100, Math.max(14, skill.priorityScore * 18))}%` }} /></span></div>)}</div>
        <button className="card-link" onClick={() => onPanel("review")} type="button">Open review queue <Icon name="arrow-up-right" size={14} /></button>
      </section>
      <p className="evidence-note"><Icon name="spark" size={16} /><span><strong>Small attempts count.</strong> Voice and text turns quietly shape your next practice.</span></p>
    </aside>
  );
}

function connectionState(phase: LiveVoicePhase, notice?: string): ConnectionState {
  if (phase === "connected") return "connected";
  if (phase === "connecting" || phase === "ending") return "connecting";
  if (phase === "text_fallback" && notice && /rate.?limit/i.test(notice)) return "rate_limited";
  return "offline";
}

function characterState(phase: LiveVoicePhase, isSpeaking: boolean, isListening: boolean): TutorCharacterState {
  if (phase === "connected" && isSpeaking) return "speaking";
  if (phase === "connected" && isListening) return "listening";
  if (phase === "connected") return "connected";
  return "idle";
}

export function StudioShell({
  state,
  onStateChange,
}: {
  state: LearnerSession;
  onStateChange?: (state: LearnerSession) => void;
}) {
  const [panel, setPanel] = useState<Panel>("none");
  const [activePhraseId, setActivePhraseId] = useState("phrase-could-i");
  const [messages, setMessages] = useState<readonly ConversationMessage[]>(conversationFixture);
  const [replayNotice, setReplayNotice] = useState("");
  const initials = state.profile.displayName.slice(0, 2).toUpperCase() || "LF";

  const liveVoice = useLiveVoice({
    itemId: activePhraseId,
    onMessage: (message: LiveVoiceMessage) => {
      const speaker: Speaker = message.role === "user" || message.source === "user" ? "learner" : "coach";
      setMessages((current) => appendMessage(current, {
        id: `voice-${String(message.event_id)}-${speaker}`,
        speaker,
        label: speaker === "learner" ? "You" : "Maya · coach",
        body: message.message,
        time: "now",
      }));
    },
    state,
  });
  const voiceNotice = replayNotice || liveVoice.notice;
  const stateConnection = connectionState(liveVoice.phase, voiceNotice);
  const tutorState = characterState(liveVoice.phase, liveVoice.isSpeaking, liveVoice.isListening);

  async function refreshState() {
    if (onStateChange) onStateChange(await refreshLearnerSession(state));
  }

  function addReply(text: string) {
    if (liveVoice.phase === "connected" && liveVoice.sendText(text)) return;
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
    setReplayNotice(result.message);
  }

  function openPractice(itemId: string) {
    setActivePhraseId(itemId);
    setPanel("practice");
  }

  return (
    <main aria-label="Conversation studio" className="voice-studio">
      <header className="voice-studio__header">
        <div className="voice-studio__brand"><span className="brand-mark">L</span><div><strong>LingoFlow</strong><span>voice studio</span></div></div>
        <div className="voice-studio__session"><span className="voice-studio__session-dot" aria-hidden="true" /><span>Five-minute practice</span><strong>Small wins, spoken aloud</strong></div>
        <div className="voice-studio__header-actions"><ConnectionStatus compact state={stateConnection} /><button aria-label="Open studio settings" className="icon-button" type="button"><Icon name="sliders" size={17} /></button><div aria-label={`${state.profile.displayName} profile`} className="voice-studio__avatar">{initials}</div></div>
      </header>
      <div className="voice-studio__body">
        <section aria-labelledby="voice-stage-title" className="voice-stage">
          <div className="voice-stage__topline"><div><Kicker>Today&apos;s conversation</Kicker><span className="voice-stage__time">Wednesday · 10:42 AM</span></div><span className={`voice-stage__status voice-stage__status--${liveVoice.phase}`} role="status"><StatusDot tone={liveVoice.phase === "connected" ? "active" : liveVoice.phase === "text_fallback" ? "warm" : "quiet"} />{voiceCopy(liveVoice.phase, liveVoice.isSpeaking, liveVoice.isListening).title}</span></div>
          <div className="voice-stage__character"><div className="voice-stage__ambient" aria-hidden="true" /><TutorCharacter state={tutorState} /><p aria-live="polite" className="voice-stage__caption">{liveVoice.phase === "connected" ? (liveVoice.isSpeaking ? "Maya is sharing a thought" : liveVoice.isListening ? "Maya is listening for you" : "You're connected with Maya") : "Meet Maya, your patient conversation partner"}</p></div>
          <div className="voice-stage__intro"><h1 id="voice-stage-title">A little more like you.</h1><p>Talk about a moment you&apos;re proud of. Maya will keep the next correction small.</p></div>
          <LiveTranscript initials={initials} isListening={liveVoice.isListening} messages={messages} phase={liveVoice.phase} />
          {panel === "practice" ? <PracticePanel itemId={activePhraseId} onClose={() => setPanel("none")} onSaved={refreshState} state={state} /> : null}
          {panel === "review" ? <ReviewPanel onClose={() => setPanel("none")} onReview={openPractice} state={state} /> : null}
          {panel === "transfer" ? <TransferPanel onClose={() => setPanel("none")} onSaved={refreshState} state={state} /> : null}
          <VoiceControls isListening={liveVoice.isListening} isSpeaking={liveVoice.isSpeaking} notice={voiceNotice} onEnd={() => { setReplayNotice(""); void liveVoice.end(); }} onReplay={() => void replayLatest()} onReply={addReply} onVoiceChange={() => { setReplayNotice(""); void liveVoice.toggle(); }} phase={liveVoice.phase} />
        </section>
        <PracticeRail activePhraseId={activePhraseId} onPanel={setPanel} onPractice={openPractice} onReplay={() => void replayLatest()} state={state} />
      </div>
    </main>
  );
}
