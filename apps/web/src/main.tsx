import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main className="shell">
      <p className="eyebrow">LINGOFLOW / FOUNDATION</p>
      <h1>Practice English with momentum.</h1>
      <p className="lede">
        A focused conversation loop for adult learners. The offline foundation is
        ready for the learning kernel and voice adapters.
      </p>
      <div className="status" role="status">
        <span className="status-dot" aria-hidden="true" />
        Offline mode ready
      </div>
    </main>
  );
}

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("LingoFlow could not find the application root.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
