import assert from "node:assert/strict";
import test from "node:test";
import { buildVoiceSessionOptions } from "../apps/web/src/components/voice-session-options.js";

test("browser voice session options use dynamic variables without an unsupported prompt override", () => {
  const options = buildVoiceSessionOptions({
    signedUrl: "wss://signed.example/session",
    learnerId: "learner-1",
    dynamicVariables: { target_language: "English", roast_mode: "off" },
  });

  assert.deepEqual(options, {
    signedUrl: "wss://signed.example/session",
    connectionType: "websocket",
    userId: "learner-1",
    dynamicVariables: { target_language: "English", roast_mode: "off" },
  });
  assert.equal("overrides" in options, false);
});
