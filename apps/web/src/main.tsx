import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConversationProvider } from "@elevenlabs/react";
import { App } from "./routes/App";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#root");

if (!root) {
  throw new Error("LingoFlow could not find the application root.");
}

createRoot(root).render(
  <StrictMode>
    <ConversationProvider>
      <App />
    </ConversationProvider>
  </StrictMode>,
);
