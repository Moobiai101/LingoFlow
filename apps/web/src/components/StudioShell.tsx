import { useState, type FormEvent } from "react";
import { ConnectionStatus } from "./ConnectionStatus";
import { Divider, Icon, Kicker, StatusDot } from "../design-system/primitives";

type Speaker = "coach" | "learner";

type ConversationMessage = {
  id: string;
  speaker: Speaker;
  label: string;
  body: string;
  time: string;
  highlighted?: string;
};

const conversationFixture: ConversationMessage[] = [
  {
    id: "prompt",
    speaker: "coach",
    label: "Maya · coach",
    body: "Tell me about a small win you had this week.",
    time: "10:42",
  },
  {
    id: "reply",
    speaker: "learner",
    label: "You",
    body: "I finally spoke up in a meeting. I was nervous, but it felt good to share my idea.",
    time: "10:43",
    highlighted: "spoke up",
  },
  {
    id: "feedback",
    speaker: "coach",
    label: "Maya · coach",
    body: "That sounds like a real win. What helped you feel ready to speak?",
    time: "10:43",
  },
];

function MessageBody({ message }: { message: ConversationMessage }) {
  if (!message.highlighted) return <>{message.body}</>;
  const [before, after] = message.body.split(message.highlighted);
  return (
    <>
      {before}
      <mark>{message.highlighted}</mark>
      {after}
    </>
  );
}

function SignalRail() {
  return (
    <aside aria-label="Conversation signals" className="signal-rail">
      <div className="signal-rail__heading">
        <div>
          <Kicker>Signal rail</Kicker>
          <h2>Stay curious</h2>
        </div>
        <button aria-label="Signal rail options" className="icon-button" type="button">
          <Icon name="more" />
        </button>
      </div>

      <section className="signal-card signal-card--warm">
        <div className="signal-card__topline">
          <span className="signal-card__label"><StatusDot tone="warm" /> Try this</span>
          <span className="signal-card__index">01</span>
        </div>
        <h3>Give your idea a little more room.</h3>
        <p>Use <strong>because</strong> to connect your thought to a reason.</p>
        <button className="text-button" type="button">
          Add to phrasebook <Icon name="plus" size={15} />
        </button>
      </section>

      <section className="phrase-card" aria-labelledby="phrase-card-title">
        <div className="phrase-card__topline">
          <span className="phrase-card__label"><Icon name="book-open" size={15} /> Phrase card</span>
          <span className="coming-soon">Soon</span>
        </div>
        <h3 id="phrase-card-title">Your useful phrases will land here.</h3>
        <div className="phrase-placeholder" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p>Save the language that sounds like you and return to it when you need a lift.</p>
      </section>

      <div className="signal-rail__tip">
        <Icon name="spark" size={17} />
        <p><strong>One gentle nudge</strong> at a time keeps practice moving.</p>
      </div>
    </aside>
  );
}

function ActionDock() {
  const [isListening, setIsListening] = useState(false);
  const [draft, setDraft] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDraft("");
  }

  return (
    <div className="action-dock-wrap">
      <form className="action-dock" onSubmit={handleSubmit}>
        <button
          aria-label={isListening ? "Stop listening" : "Start voice practice"}
          aria-pressed={isListening}
          className={`voice-button ${isListening ? "voice-button--listening" : ""}`}
          onClick={() => setIsListening((value) => !value)}
          type="button"
        >
          <Icon name="mic" size={21} />
        </button>
        <label className="sr-only" htmlFor="practice-note">Write a reply</label>
        <input
          id="practice-note"
          onChange={(event) => setDraft(event.target.value)}
          placeholder={isListening ? "Listening for your voice…" : "Or write what you would say…"}
          value={draft}
        />
        <div className="action-dock__actions">
          <button aria-label="Play latest coach message" className="dock-icon-button" type="button">
            <Icon name="play" size={16} />
          </button>
          <button aria-label="Send written reply" className="send-button" disabled={!draft.trim()} type="submit">
            <Icon name="arrow-up-right" size={17} />
          </button>
        </div>
      </form>
      <p className="action-dock__hint">
        <Icon name="headphones" size={14} />
        Voice is off in local practice. Your words stay in this session.
      </p>
    </div>
  );
}

export function StudioShell({ onOpenOnboarding }: { onOpenOnboarding: () => void }) {
  return (
    <main className="studio-layout" aria-label="Conversation studio">
      <aside className="studio-sidebar">
        <div className="sidebar-heading">
          <div className="brand-lockup" aria-label="LingoFlow home">
            <span className="brand-mark">L</span>
            <span>LingoFlow</span>
          </div>
          <button aria-label="Open studio menu" className="icon-button icon-button--subtle" type="button">
            <Icon name="sliders" size={17} />
          </button>
        </div>

        <div className="sidebar-profile">
          <div className="avatar">AR</div>
          <div>
            <strong>Arjun&apos;s studio</strong>
            <span>Everyday conversation</span>
          </div>
          <Icon name="chevron-down" size={15} />
        </div>

        <nav aria-label="Studio navigation" className="studio-nav">
          <Kicker>Your space</Kicker>
          <button className="studio-nav__item studio-nav__item--active" type="button">
            <Icon name="waveform" size={18} />
            <span>Practice studio</span>
            <span className="nav-count">01</span>
          </button>
          <button className="studio-nav__item" onClick={onOpenOnboarding} type="button">
            <Icon name="spark" size={18} />
            <span>Practice focus</span>
          </button>
          <button className="studio-nav__item" type="button">
            <Icon name="book-open" size={18} />
            <span>Phrasebook</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="streak-card">
            <div className="streak-card__copy">
              <Kicker>Keep the thread</Kicker>
              <strong>3 day streak</strong>
            </div>
            <span className="streak-flame">✦</span>
          </div>
          <ConnectionStatus />
          <p className="sidebar-footer">Built for small, consistent wins.</p>
        </div>
      </aside>

      <section className="studio-main">
        <header className="studio-main__header">
          <div className="session-breadcrumb">
            <span>Practice studio</span>
            <Icon name="arrow-up-right" size={13} />
            <strong>Small wins</strong>
          </div>
          <div className="studio-main__header-actions">
            <ConnectionStatus compact />
            <Divider />
            <button aria-label="Session options" className="icon-button" type="button">
              <Icon name="more" />
            </button>
          </div>
        </header>

        <div className="studio-main__body">
          <div className="conversation-column">
            <div className="session-intro">
              <div>
                <Kicker>Wednesday · 10:42 AM</Kicker>
                <h1>A little more like you.</h1>
                <p>A five-minute conversation about the moments you&apos;re proud of.</p>
              </div>
              <div className="session-meta">
                <span><Icon name="clock" size={14} /> 04:12</span>
                <span><Icon name="sound" size={14} /> Calm pace</span>
              </div>
            </div>

            <div className="conversation-lane" aria-label="Conversation with Maya">
              <div className="conversation-lane__line" aria-hidden="true" />
              {conversationFixture.map((message) => (
                <article className={`message message--${message.speaker}`} key={message.id}>
                  <div className="message__avatar" aria-hidden="true">
                    {message.speaker === "coach" ? <span>M</span> : <span>AR</span>}
                  </div>
                  <div className="message__content">
                    <div className="message__meta">
                      <span>{message.label}</span>
                      <time>{message.time}</time>
                    </div>
                    <p><MessageBody message={message} /></p>
                    {message.id === "reply" ? (
                      <span className="message__signal"><StatusDot tone="active" /> Natural phrasing</span>
                    ) : null}
                  </div>
                </article>
              ))}
              <div className="conversation-lane__next">
                <span className="conversation-lane__next-dot" />
                <span>Maya is listening for your next thought</span>
              </div>
            </div>

            <ActionDock />
          </div>
          <SignalRail />
        </div>
      </section>
    </main>
  );
}
