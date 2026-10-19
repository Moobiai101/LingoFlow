import assert from "node:assert/strict";
import test from "node:test";
import { isPlaceholderTranscript } from "../apps/web/src/components/live-voice.js";
import { buildVoiceSessionOptions } from "../apps/web/src/components/voice-session-options.js";

test("browser voice session options use dynamic variables without an unsupported prompt override", () => {
  const options = buildVoiceSessionOptions({
    conversationToken: "conversation-token",
    signedUrl: "wss://signed.example/session",
    learnerId: "learner-1",
    dynamicVariables: { target_language: "English", roast_mode: "off" },
  });

  assert.deepEqual(options, {
    conversationToken: "conversation-token",
    connectionType: "webrtc",
    userId: "learner-1",
    dynamicVariables: { target_language: "English", roast_mode: "off" },
  });
  assert.equal("signedUrl" in options, false);
  assert.equal("overrides" in options, false);
});

test("browser voice options retain signed URL WebSocket fallback when no token is issued", () => {
  const options = buildVoiceSessionOptions({
    signedUrl: "wss://signed.example/session",
    learnerId: "learner-1",
    dynamicVariables: { target_language: "English" },
  });

  assert.deepEqual(options, {
    signedUrl: "wss://signed.example/session",
    connectionType: "websocket",
    userId: "learner-1",
    dynamicVariables: { target_language: "English" },
  });
});

test("placeholder transcripts are silence and do not become evidence", () => {
  assert.equal(isPlaceholderTranscript(""), true);
  assert.equal(isPlaceholderTranscript("   \n"), true);
  assert.equal(isPlaceholderTranscript("..."), true);
  assert.equal(isPlaceholderTranscript(" … … "), true);
  assert.equal(isPlaceholderTranscript("I finally spoke up"), false);
});
