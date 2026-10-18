import { useState } from "react";
import { Button, Icon, Kicker } from "../design-system/primitives";

const practiceModes = [
  {
    id: "everyday",
    title: "Everyday conversation",
    detail: "Build ease for the moments you have every day.",
    tag: "Recommended",
  },
  {
    id: "work",
    title: "Work & meetings",
    detail: "Speak clearly when the room moves quickly.",
    tag: "Practical",
  },
  {
    id: "travel",
    title: "Travel with confidence",
    detail: "Get comfortable asking, answering, and exploring.",
    tag: "Useful",
  },
] as const;

export function OnboardingShell({ onComplete }: { onComplete: () => void }) {
  const [selectedMode, setSelectedMode] = useState<(typeof practiceModes)[number]["id"]>("everyday");

  return (
    <main className="onboarding-page" aria-labelledby="onboarding-title">
      <div className="onboarding-page__ornament onboarding-page__ornament--one" />
      <div className="onboarding-page__ornament onboarding-page__ornament--two" />
      <section className="onboarding-card">
        <div className="onboarding-card__topline">
          <span className="step-count">01 <span>/ 03</span></span>
          <span className="step-label">Set your practice rhythm</span>
        </div>

        <div className="onboarding-card__intro">
          <Kicker>Welcome to LingoFlow</Kicker>
          <h1 id="onboarding-title">Make English feel more like yours.</h1>
          <p>
            Short, human conversations that meet you where you are. Choose a focus and
            we&apos;ll shape your first practice lane around it.
          </p>
        </div>

        <div className="onboarding-progress" aria-label="Onboarding progress">
          <span className="onboarding-progress__active" />
          <span />
          <span />
        </div>

        <fieldset className="mode-picker">
          <legend>What would you like to feel more ready for?</legend>
          <div className="mode-picker__options">
            {practiceModes.map((mode) => (
              <button
                aria-pressed={selectedMode === mode.id}
                className={`mode-option ${selectedMode === mode.id ? "mode-option--selected" : ""}`}
                key={mode.id}
                onClick={() => setSelectedMode(mode.id)}
                type="button"
              >
                <span className="mode-option__heading">
                  <span>{mode.title}</span>
                  {selectedMode === mode.id ? <Icon name="check" size={16} /> : null}
                </span>
                <span className="mode-option__detail">{mode.detail}</span>
                <span className="mode-option__tag">{mode.tag}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="onboarding-card__footer">
          <p>
            <Icon name="clock" size={16} />
            Start with 5 minutes. You can change this anytime.
          </p>
          <Button icon="arrow-up-right" onClick={onComplete} size="lg" variant="accent">
            Enter your studio
          </Button>
        </div>
      </section>
      <p className="onboarding-page__note">
        <span className="note-mark">LF</span>
        A calmer way to keep showing up.
      </p>
    </main>
  );
}
