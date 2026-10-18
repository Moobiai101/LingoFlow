import { useState } from "react";
import { Button, Icon, Kicker } from "../design-system/primitives";
import { createOrHydrateLearner, defaultProfile, type GoalId, type LearnerSession, type LevelId, type OnboardingProfile, type PersonalityId } from "./learner-state";

const goals: readonly { id: GoalId; title: string; detail: string; tag: string }[] = [
  { id: "everyday", title: "Everyday conversation", detail: "Build ease for the moments you have every day.", tag: "Recommended" },
  { id: "work", title: "Work and meetings", detail: "Speak clearly when the room moves quickly.", tag: "Practical" },
  { id: "travel", title: "Travel with confidence", detail: "Get comfortable asking, answering, and exploring.", tag: "Useful" },
];

const levels: readonly { id: LevelId; title: string; detail: string }[] = [
  { id: "a1", title: "Starting out", detail: "I know a few words and phrases." },
  { id: "a2", title: "Finding my feet", detail: "I can handle familiar, simple conversations." },
  { id: "b1", title: "Building range", detail: "I can explain myself, with a few pauses." },
  { id: "b2", title: "Speaking freely", detail: "I can keep up with most everyday conversations." },
];

const personalities: readonly { id: PersonalityId; title: string; detail: string }[] = [
  { id: "patient", title: "Patient mentor", detail: "Warm prompts, room to think, gentle corrections." },
  { id: "energetic", title: "Bright encourager", detail: "A little momentum and plenty of celebration." },
  { id: "direct", title: "Clear-eyed coach", detail: "Concise feedback and a practical next step." },
];

export function OnboardingShell({ onComplete }: { onComplete: (state: LearnerSession) => void }) {
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<OnboardingProfile>(defaultProfile);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  function update<K extends keyof OnboardingProfile>(key: K, value: OnboardingProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function finish() {
    setIsSaving(true);
    setError("");
    const state = await createOrHydrateLearner(profile);
    setIsSaving(false);
    if (state.connection === "offline") setError("Your studio is ready offline. We’ll sync this learner when the conversation line is available.");
    onComplete(state);
  }

  return (
    <main className="onboarding-page" aria-labelledby="onboarding-title">
      <div className="onboarding-page__ornament onboarding-page__ornament--one" />
      <div className="onboarding-page__ornament onboarding-page__ornament--two" />
      <section className="onboarding-card" aria-busy={isSaving}>
        <div className="onboarding-card__topline">
          <span className="step-count">0{step} <span>/ 03</span></span>
          <span className="step-label">A few details, then your first practice</span>
        </div>

        <div className="onboarding-card__intro">
          <Kicker>Welcome to LingoFlow</Kicker>
          <h1 id="onboarding-title">Make English feel more like yours.</h1>
          <p>Short, human practice for adult Hindi speakers. Choose what will help today; we’ll keep the first conversation light.</p>
        </div>

        <div className="onboarding-progress" aria-label={`Onboarding progress, step ${step} of 3`}>
          {[1, 2, 3].map((item) => <span className={item <= step ? "onboarding-progress__active" : ""} key={item} />)}
        </div>

        {step === 1 ? (
          <div className="onboarding-step">
            <div className="field-grid field-grid--languages">
              <label className="form-field">
                <span>My first language</span>
                <select value={profile.nativeLanguage} onChange={(event) => update("nativeLanguage", event.target.value)}>
                  <option value="hi">Hindi</option>
                  <option value="bn">Bengali</option>
                  <option value="mr">Marathi</option>
                  <option value="ta">Tamil</option>
                </select>
              </label>
              <label className="form-field">
                <span>Language I’m practicing</span>
                <select value={profile.targetLanguage} onChange={(event) => update("targetLanguage", event.target.value)}>
                  <option value="en">English</option>
                </select>
              </label>
            </div>
            <label className="form-field form-field--wide">
              <span>What should we call you? <em>Optional</em></span>
              <input maxLength={80} onChange={(event) => update("displayName", event.target.value)} placeholder="Asha" value={profile.displayName} />
            </label>
            <p className="onboarding-helper"><Icon name="lock" size={15} /> These details shape your prompts and stay in your local studio.</p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="onboarding-step">
            <fieldset className="mode-picker">
              <legend>What would you like to feel more ready for?</legend>
              <div className="mode-picker__options">
                {goals.map((goal) => (
                  <button aria-pressed={profile.goal === goal.id} className={`mode-option ${profile.goal === goal.id ? "mode-option--selected" : ""}`} key={goal.id} onClick={() => update("goal", goal.id)} type="button">
                    <span className="mode-option__heading"><span>{goal.title}</span>{profile.goal === goal.id ? <Icon name="check" size={16} /> : null}</span>
                    <span className="mode-option__detail">{goal.detail}</span>
                    <span className="mode-option__tag">{goal.tag}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="level-picker">
              <legend>Where does English feel today?</legend>
              <div className="level-picker__options">
                {levels.map((level) => (
                  <button aria-pressed={profile.level === level.id} className={`level-option ${profile.level === level.id ? "level-option--selected" : ""}`} key={level.id} onClick={() => update("level", level.id)} type="button">
                    <strong>{level.title}</strong><span>{level.detail}</span><small>{level.id.toUpperCase()}</small>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="onboarding-step">
            <fieldset className="mode-picker">
              <legend>How should your tutor sound?</legend>
              <div className="personality-options">
                {personalities.map((personality) => (
                  <button aria-pressed={profile.personality === personality.id} className={`personality-option ${profile.personality === personality.id ? "personality-option--selected" : ""}`} key={personality.id} onClick={() => update("personality", personality.id)} type="button">
                    <span className="personality-option__heading"><strong>{personality.title}</strong>{profile.personality === personality.id ? <Icon name="check" size={16} /> : null}</span>
                    <span>{personality.detail}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="consent-card">
              <input checked={profile.roastOptIn} onChange={(event) => update("roastOptIn", event.target.checked)} type="checkbox" />
              <span className="consent-card__copy"><strong>Turn on friendly roast mode</strong><span>Optional, adult-only, and aimed at the attempt—not you. Your tutor may add a playful nudge when a correction is clear.</span></span>
              <span className="consent-card__tag">Off by default</span>
            </label>
            <div className="onboarding-summary"><span>{profile.nativeLanguage === "hi" ? "Hindi" : profile.nativeLanguage} → {profile.targetLanguage === "en" ? "English" : profile.targetLanguage}</span><span>{goals.find((goal) => goal.id === profile.goal)?.title}</span><span>{levels.find((level) => level.id === profile.level)?.id.toUpperCase()} · {personalities.find((item) => item.id === profile.personality)?.title}</span></div>
          </div>
        ) : null}

        {error ? <p className="onboarding-notice" role="status"><Icon name="cloud-off" size={15} /> {error}</p> : null}
        <div className="onboarding-card__footer">
          <p><Icon name="clock" size={16} /> About 2 minutes. You can change this anytime.</p>
          <div className="onboarding-actions">
            {step > 1 ? <Button onClick={() => setStep((current) => current - 1)} size="lg" variant="ghost">Back</Button> : null}
            {step < 3 ? <Button icon="arrow-up-right" onClick={() => setStep((current) => current + 1)} size="lg" variant="accent">Continue</Button> : <Button disabled={isSaving} icon="arrow-up-right" onClick={finish} size="lg" variant="accent">{isSaving ? "Opening your studio…" : "Open my studio"}</Button>}
          </div>
        </div>
      </section>
      <p className="onboarding-page__note"><span className="note-mark">LF</span>A calmer way to keep showing up.</p>
    </main>
  );
}
