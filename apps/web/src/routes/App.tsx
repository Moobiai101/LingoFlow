import { useState } from "react";
import { ConnectionStatus } from "../components/ConnectionStatus";
import { OnboardingShell } from "../components/OnboardingShell";
import { StudioShell } from "../components/StudioShell";
import { Icon } from "../design-system/primitives";

type AppView = "onboarding" | "studio";

export function App() {
  const [view, setView] = useState<AppView>("studio");

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar__brand">
          <span className="brand-mark brand-mark--small">L</span>
          <span>LingoFlow</span>
          <span className="topbar-beta">beta</span>
        </div>
        <nav aria-label="Main navigation" className="app-topbar__nav">
          <button
            aria-current={view === "studio" ? "page" : undefined}
            className={view === "studio" ? "topbar-link topbar-link--active" : "topbar-link"}
            onClick={() => setView("studio")}
            type="button"
          >
            Studio
          </button>
          <button
            aria-current={view === "onboarding" ? "page" : undefined}
            className={view === "onboarding" ? "topbar-link topbar-link--active" : "topbar-link"}
            onClick={() => setView("onboarding")}
            type="button"
          >
            Getting started
          </button>
        </nav>
        <div className="app-topbar__status">
          <ConnectionStatus compact />
          <button aria-label="Open profile menu" className="topbar-avatar" type="button">AR</button>
          <button aria-label="Open settings" className="icon-button icon-button--topbar" type="button">
            <Icon name="sliders" size={17} />
          </button>
        </div>
      </header>

      {view === "studio" ? <StudioShell onOpenOnboarding={() => setView("onboarding")} /> : null}
      {view === "onboarding" ? <OnboardingShell onComplete={() => setView("studio")} /> : null}
    </div>
  );
}
