import assert from "node:assert/strict";
import test from "node:test";
import {
  buildElevenLabsSessionContext,
  buildPhraseReplayCacheKey,
  ElevenLabsAgentProvider,
  FakeAssessmentProvider,
  FakeVoiceProvider,
  normalizeElevenLabsEvent,
} from "../packages/providers/dist/index.js";
import {
  createWebhookSignature,
  IdempotencyStore,
  validateToolRequest,
  validateWebhookRequest,
} from "../apps/server/src/webhooks/index.js";

const sessionInput = {
  request: {
    sessionId: "session-1",
    learnerId: "learner-1",
    targetLanguage: "en",
    nativeLanguage: "hi",
    itemId: "item-1",
  },
  learner: { level: "a2", displayName: "Asha", isAdult: true },
  objective: { title: "Order at a cafe", description: "Use polite requests" },
  activeItem: { targetText: "Could I have water?", translation: "क्या मुझे पानी मिल सकता है?", language: "en" },
  topErrorPatterns: ["question word order", "articles"],
  reviewItem: { id: "review-1", reason: "repeated_error", priority: "high" },
  tutorPersonality: "patient mentor",
  roastMode: "off" as const,
} as const;

test("ElevenLabs session context carries compact learner context and flash model", () => {
  const context = buildElevenLabsSessionContext(sessionInput);
  assert.equal(context.modelId, "eleven_flash_v2");
  assert.equal(context.dynamic_variables.target_language, "en");
  assert.equal(context.dynamic_variables.top_error_pattern_2, "articles");
  assert.equal(context.conversation_config_override.tts.model_id, "eleven_flash_v2");
  assert.match(context.systemPrompt, /roast mode is off/i);
});

test("ElevenLabs retries transient provider responses before returning a WebRTC conversation token", async () => {
  let calls = 0;
  const urls: string[] = [];
  const provider = new ElevenLabsAgentProvider({
    mode: "live",
    apiKey: "api-secret",
    agentId: "agent-1",
    maxRetries: 2,
    retryDelayMs: 0,
    fetchImpl: async (input) => {
      calls += 1;
      urls.push(String(input));
      return calls === 1
        ? new Response("busy", { status: 503 })
        : new Response(JSON.stringify({ token: "conversation-token" }), { status: 200 });
    },
  });
  const result = await provider.connect(sessionInput);
  assert.equal(result.conversationToken, "conversation-token");
  assert.equal(result.signedUrl, undefined);
  assert.deepEqual(urls, [
    "https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent-1",
    "https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=agent-1",
  ]);
  assert.equal(calls, 2);
});

test("ElevenLabs aborts a hung provider request at its timeout", async () => {
  let aborted = false;
  const provider = new ElevenLabsAgentProvider({
    mode: "live",
    apiKey: "api-secret",
    agentId: "agent-1",
    timeoutMs: 5,
    maxRetries: 0,
    fetchImpl: async (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        aborted = true;
        reject(new Error("aborted by test signal"));
      }, { once: true });
    }),
  });
  await assert.rejects(provider.connect(sessionInput), /aborted by test signal/);
  assert.equal(aborted, true);
});

test("ElevenLabs does not retry permanent provider responses", async () => {
  let calls = 0;
  const provider = new ElevenLabsAgentProvider({
    mode: "live",
    apiKey: "api-secret",
    agentId: "agent-1",
    maxRetries: 3,
    retryDelayMs: 0,
    fetchImpl: async () => {
      calls += 1;
      return new Response("unauthorized", { status: 401 });
    },
  });
  await assert.rejects(provider.connect(sessionInput), /ElevenLabs request failed \(401\)/);
  assert.equal(calls, 1);
});

test("ElevenLabs events normalize into internal learner, tutor, and interruption events", () => {
  const learner = normalizeElevenLabsEvent({
    type: "user_transcript",
    event_id: "evt-1",
    conversation_id: "session-1",
    user_transcription_event: { user_transcript: "I want water" },
    timestamp: 1_700_000_000,
  });
  assert.deepEqual(learner && { id: learner.id, type: learner.type, text: learner.text, sessionId: learner.sessionId }, {
    id: "evt-1", type: "learner_turn", text: "I want water", sessionId: "session-1",
  });
  const tutor = normalizeElevenLabsEvent({ type: "agent_response", conversation_id: "session-1", agent_response_event: { agent_response: "Try: Could I have water?" } }, "2026-01-01T00:00:00.000Z");
  assert.equal(tutor?.type, "tutor_turn");
  assert.equal(tutor?.text, "Try: Could I have water?");
  assert.equal(normalizeElevenLabsEvent({ type: "interruption", conversation_id: "session-1" })?.state, "interrupted");
});

test("phrase replay cache keys vary by every audio input", () => {
  const base = { phraseId: "p:1", voiceId: "voice", language: "en", speed: 1, contentVersion: "v1", modelId: "eleven_v4" };
  const key = buildPhraseReplayCacheKey(base);
  assert.match(key, /^phrase-replay:/);
  assert.notEqual(key, buildPhraseReplayCacheKey({ ...base, speed: 0.8 }));
  assert.notEqual(key, buildPhraseReplayCacheKey({ ...base, contentVersion: "v2" }));
  assert.notEqual(key, buildPhraseReplayCacheKey({ ...base, modelId: "other-model" }));
});

test("fake providers are deterministic and do not require credentials", async () => {
  const voice = new FakeVoiceProvider();
  const context = voice.createSessionContext(sessionInput);
  assert.equal(context.modelId, "fake_voice_v1");
  const audio = await voice.replayPhrase({ phraseId: "p1", text: "Hello", language: "en", voiceId: "fake", contentVersion: "1" });
  assert.equal(new TextDecoder().decode(audio.audio), "fake-audio:en:Hello");
  const assessment = new FakeAssessmentProvider();
  const result = await assessment.assess({ id: "request-1", learnerId: "learner-1", sessionId: "session-1", itemId: "item-1", expected: "Hello", observed: "hello", language: "en", capability: "pronunciation_assessment" });
  assert.equal(result.status, "complete");
  assert.equal(result.score, 1);
  const uncertain = await assessment.assess({ id: "request-2", learnerId: "learner-1", sessionId: "session-1", itemId: "item-1", expected: "Hello", observed: "yellow", language: "en", capability: "pronunciation_assessment" });
  assert.equal(uncertain.status, "uncertain");
  assert.equal(uncertain.score, undefined);
});

test("signed webhook validation rejects replays and accepts only the first delivery", () => {
  const rawBody = JSON.stringify({ event: "agent_response" });
  const now = 1_700_000_000_000;
  const signature = createWebhookSignature(rawBody, "test-secret", now / 1000);
  const idempotency = new IdempotencyStore();
  const request = { rawBody, headers: { "elevenlabs-signature": signature, "idempotency-key": "delivery-1" } };
  assert.deepEqual(validateWebhookRequest(request, { secret: "test-secret", now: () => now, idempotency }), { ok: true, duplicate: false, requestId: "delivery-1" });
  assert.deepEqual(validateWebhookRequest(request, { secret: "test-secret", now: () => now, idempotency }), { ok: true, duplicate: true, requestId: "delivery-1" });
  assert.equal(validateWebhookRequest({ ...request, headers: { ...request.headers, "elevenlabs-signature": "bad" } }, { secret: "test-secret", now: () => now, idempotency }).ok, false);
});

test("tool validation scopes calls and makes request ids idempotent", () => {
  const idempotency = new IdempotencyStore();
  const request = { toolName: "record_learning_evidence", requestId: "tool-1", learnerId: "learner-1", sessionId: "session-1", args: {} };
  const first = validateToolRequest(request, { expectedLearnerId: "learner-1", expectedSessionId: "session-1", idempotency });
  assert.equal(first.ok, true);
  const second = validateToolRequest(request, { expectedLearnerId: "learner-1", expectedSessionId: "session-1", idempotency });
  assert.equal(second.ok, true);
  if (second.ok) assert.equal(second.duplicate, true);
  assert.equal(validateToolRequest({ ...request, requestId: "tool-2", learnerId: "other" }, { expectedLearnerId: "learner-1" }).ok, false);
  assert.equal(validateToolRequest({ ...request, requestId: "tool-3", toolName: "delete_everything" }).ok, false);
});
