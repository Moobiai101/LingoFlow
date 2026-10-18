import assert from "node:assert/strict";
import Fastify from "fastify";
import test from "node:test";
import { registerVoiceRoutes } from "../apps/server/src/http/voice-routes.js";
import { SqliteRepository } from "../apps/server/src/persistence/index.js";

const NOW = "2026-01-15T12:00:00.000Z";

function seed(repository: SqliteRepository): void {
  repository.createLearner({
    id: "learner-voice",
    nativeLanguage: "hi",
    targetLanguage: "en",
    level: "a2",
    isAdult: true,
  });
  repository.createSession({
    id: "session-voice",
    learnerId: "learner-voice",
    targetLanguage: "en",
    nativeLanguage: "hi",
    startedAt: NOW,
  });
}

function makeApp(environment: NodeJS.ProcessEnv, fetchImpl?: typeof fetch) {
  const repository = new SqliteRepository({ path: ":memory:", now: () => NOW });
  seed(repository);
  const app = Fastify({ logger: false });
  registerVoiceRoutes(app, { repository, environment, fetchImpl, now: () => NOW });
  return { app, repository };
}

function connectPayload() {
  return { learnerId: "learner-voice", sessionId: "session-voice", tutorPersonality: "patient mentor" };
}

function replayPayload() {
  return { phraseId: "phrase-voice", text: "Could I have water?", language: "en", voiceId: "voice-1", contentVersion: "1" };
}

test("offline connect selects the fake provider without credentials", async () => {
  let fetchCalls = 0;
  const { app, repository } = makeApp({ LINGOFLOW_MODE: "offline", ELEVENLABS_API_KEY: "must-not-be-read" }, async () => {
    fetchCalls += 1;
    throw new Error("offline must not call fetch");
  });
  const response = await app.inject({ method: "POST", url: "/api/voice/connect", payload: connectPayload() });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    mode: "offline",
    status: "ready",
    fallback: false,
    context: {
      sessionId: "session-voice",
      learnerId: "learner-voice",
      modelId: "fake_voice_v1",
      dynamicVariables: {
        target_language: "en",
        native_language: "hi",
        learner_level: "a2",
        current_objective: "",
        active_phrase: "",
        top_error_pattern_1: "",
        top_error_pattern_2: "",
        review_item: "",
        tutor_personality: "patient mentor",
        roast_mode: "off",
      },
      systemPrompt: "Offline fake tutor: use deterministic transcript events and clear correction feedback.",
    },
  });
  assert.equal(fetchCalls, 0);
  const replay = await app.inject({ method: "POST", url: "/api/voice/replay", payload: replayPayload() });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.headers["content-type"], "audio/mock");
  assert.equal(replay.headers["x-lingoflow-mode"], "offline");
  assert.equal(replay.headers["x-lingoflow-model"], "fake_voice_v1");
  assert.equal(replay.body, "fake-audio:en:Could I have water?");
  await app.close();
  repository.close();
});

test("live connect without credentials returns a safe text fallback", async () => {
  const { app, repository } = makeApp({ LINGOFLOW_MODE: "live" });
  const response = await app.inject({ method: "POST", url: "/api/voice/connect", payload: connectPayload() });
  assert.equal(response.statusCode, 200);
  const body = response.json();
  assert.equal(body.mode, "live");
  assert.equal(body.status, "text_fallback");
  assert.equal(body.fallback, true);
  assert.equal(body.fallbackDetails.code, "missing_credentials");
  assert.match(body.fallbackDetails.message, /text practice/i);
  assert.equal(body.signedUrl, undefined);
  assert.equal(JSON.stringify(body).includes("ELEVENLABS_API_KEY"), false);
  await app.close();
  repository.close();
});

test("live connect fetches a signed URL and never returns the API key", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ signed_url: "wss://signed.example/session" }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const { app, repository } = makeApp({ LINGOFLOW_MODE: "live", ELEVENLABS_API_KEY: "api-secret", ELEVENLABS_AGENT_ID: "agent-1" }, fetchImpl);
  const response = await app.inject({ method: "POST", url: "/api/voice/connect", payload: connectPayload() });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().signedUrl, "wss://signed.example/session");
  assert.equal(response.body.includes("api-secret"), false);
  assert.equal(calls.length, 1);
  assert.match(calls[0]?.url ?? "", /agent_id=agent-1/);
  assert.equal((calls[0]?.init?.headers as Record<string, string>)["xi-api-key"], "api-secret");
  await app.close();
  repository.close();
});

test("live phrase replay uses eleven_v4, caches audio, and sets binary headers", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls += 1;
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    assert.equal(body.model_id, "eleven_v4");
    assert.equal((init?.headers as Record<string, string>)["xi-api-key"], "api-secret");
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } });
  };
  const { app, repository } = makeApp({ LINGOFLOW_MODE: "live", ELEVENLABS_API_KEY: "api-secret" }, fetchImpl);
  const first = await app.inject({ method: "POST", url: "/api/voice/replay", payload: replayPayload() });
  const second = await app.inject({ method: "POST", url: "/api/voice/replay", payload: replayPayload() });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(calls, 1);
  assert.equal(first.headers["content-type"], "audio/mpeg");
  assert.equal(first.headers["cache-control"], "private, max-age=3600");
  assert.equal(first.headers["x-lingoflow-model"], "eleven_v4");
  assert.equal(first.headers["x-lingoflow-mode"], "live");
  assert.deepEqual([...first.rawPayload], [1, 2, 3]);
  assert.deepEqual([...second.rawPayload], [1, 2, 3]);
  assert.equal(first.body.includes("api-secret"), false);
  await app.close();
  repository.close();
});

test("live provider failures produce a text fallback response", async () => {
  const fetchImpl: typeof fetch = async () => { throw new Error("provider payload contained api-secret"); };
  const { app, repository } = makeApp({ LINGOFLOW_MODE: "live", ELEVENLABS_API_KEY: "api-secret", ELEVENLABS_AGENT_ID: "agent-1" }, fetchImpl);
  const connect = await app.inject({ method: "POST", url: "/api/voice/connect", payload: connectPayload() });
  assert.equal(connect.statusCode, 200);
  assert.equal(connect.json().fallbackDetails.code, "provider_unavailable");
  const replay = await app.inject({ method: "POST", url: "/api/voice/replay", payload: replayPayload() });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(replay.json().status, "text_fallback");
  assert.equal(replay.json().message.includes("api-secret"), false);
  await app.close();
  repository.close();
});
