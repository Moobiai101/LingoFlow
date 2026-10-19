import { useEffect, useState } from "react";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { createOrHydrateLearner, defaultProfile, hydrateSavedLearner, fallbackLearnerSession, type LearnerSession } from "../components/learner-state";
import { StudioShell } from "../components/StudioShell";
import { Icon } from "../design-system/primitives";

export function App() {
  const [learnerState, setLearnerState] = useState<LearnerSession>(fallbackLearnerSession);

  useEffect(() => {
    let active = true;
    void (async () => {
      const saved = await hydrateSavedLearner();
      const state = saved ?? await createOrHydrateLearner(defaultProfile);
      if (active) setLearnerState(state);
    })();
    return () => { active = false; };
  }, []);

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar__brand"><span className="brand-mark brand-mark--small">L</span><span>LingoFlow</span><span className="topbar-beta">beta</span></div>
        <nav aria-label="Main navigation" className="app-topbar__nav">
          <span aria-current="page" className="topbar-link topbar-link--active">Studio</span>
        </nav>
        <div className="app-topbar__status"><ConnectionStatus compact state={learnerState.connection === "connected" ? "ready" : "offline"} /><button aria-label="Open profile menu" className="topbar-avatar" type="button">{learnerState.profile.displayName.slice(0, 2).toUpperCase()}</button><button aria-label="Open settings" className="icon-button icon-button--topbar" type="button"><Icon name="sliders" size={17} /></button></div>
      </header>
      <StudioShell onStateChange={setLearnerState} state={learnerState} />
    </div>
  );
}
