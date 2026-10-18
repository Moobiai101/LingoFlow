import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createApp } from "../apps/server/src/index.js";
import { SqliteRepository } from "../apps/server/src/persistence/index.js";
import { createWebhookSignature } from "../apps/server/src/webhooks/index.js";

const NOW = "2026-01-15T12:00:00.000Z";

function jsonRequest(app: ReturnType<typeof createApp>, method: string, url: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.inject({
    method,
    url,
    headers: body === undefined ? headers : { "content-type": "application/json", ...headers },
    ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
  });
}

async function createTestApp(path: string, environment: NodeJS.ProcessEnv = {}) {
  return createApp({
    repository: new SqliteRepository({ path, now: () => NOW }),
    environment: { LINGOFLOW_MODE: "offline", ...environment },
    now: () => NOW,
  });
}

test("learner state survives an application restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lingoflow-api-"));
  const path = join(directory, "learning.sqlite");
  const first = await createTestApp(path);
  const learner = await jsonRequest(first, "POST", "/api/learners", {
    id: "learner-restart",
    nativeLanguage: "hi",
    targetLanguage: "en",
    level: "a2",
    isAdult: true,
    objectives: [{ id: "objective-cafe", title: "Order at a cafe", skillIds: ["questions"] }],
    phrases: [{ id: "phrase-water", skillId: "questions", targetText: "Could I have water?", language: "en" }],
  });
  assert.equal(learner.statusCode, 201);
  const session = await jsonRequest(first, "POST", "/api/sessions", { id: "session-restart", learnerId: "learner-restart" });
  assert.equal(session.statusCode, 201);
  const evidence = await jsonRequest(first, "POST", "/api/evidence", {
    id: "evidence-restart",
    learnerId: "learner-restart",
    sessionId: "session-restart",
    itemId: "phrase-water",
    skillId: "questions",
    type: "attempted",
    outcome: "failure",
    confidence: 0.9,
    source: "conversation",
    context: { turnId: "turn-1" },
    createdAt: NOW,
  });
  assert.equal(evidence.statusCode, 201);
  await first.close();

  const second = await createTestApp(path);
  const summary = await second.inject({ method: "GET", url: "/api/learners/learner-restart/summary" });
  assert.equal(summary.statusCode, 200);
  assert.equal(summary.json().evidenceCount, 1);
  assert.equal(summary.json().learner.id, "learner-restart");
  assert.equal((await second.inject({ method: "GET", url: "/api/learners/learner-restart/objectives" })).json().objectives[0].title, "Order at a cafe");
  await second.close();
  await rm(directory, { recursive: true, force: true });
});

test("evidence insertion is idempotent and invalid writes do not persist", async () => {
  const repository = new SqliteRepository({ path: ":memory:", now: () => NOW });
  const app = await createApp({ repository, environment: { LINGOFLOW_MODE: "offline" }, now: () => NOW });
  await jsonRequest(app, "POST", "/api/learners", { id: "learner-evidence", nativeLanguage: "hi", targetLanguage: "en", isAdult: true });
  await jsonRequest(app, "POST", "/api/sessions", { id: "session-evidence", learnerId: "learner-evidence" });
  const payload = {
    id: "evidence-once",
    learnerId: "learner-evidence",
    sessionId: "session-evidence",
    itemId: "item-1",
    type: "attempted",
    outcome: "failure",
    confidence: 0.9,
    source: "conversation",
    context: { turnId: "turn-1" },
    createdAt: NOW,
  };
  assert.equal((await jsonRequest(app, "POST", "/api/evidence", payload)).statusCode, 201);
  const duplicate = await jsonRequest(app, "POST", "/api/evidence", { ...payload, observed: "different replay" });
  assert.equal(duplicate.statusCode, 200);
  assert.equal(duplicate.json().duplicate, true);
  assert.equal(duplicate.json().event.observed, undefined);
  const invalid = await jsonRequest(app, "POST", "/api/evidence", { ...payload, id: "evidence-invalid", confidence: 2 });
  assert.equal(invalid.statusCode, 400);
  assert.equal((await app.inject({ method: "GET", url: "/api/learners/learner-evidence/summary" })).json().evidenceCount, 1);

  assert.throws(() => repository.appendEvidence({ ...payload, id: "orphan", sessionId: "missing-session" } as unknown as Parameters<SqliteRepository["appendEvidence"]>[0]), /Session 'missing-session'/);
  assert.equal(repository.evidenceForLearner("learner-evidence").length, 1);
  await app.close();
});

test("review queue output is deterministic and prioritizes repeated errors", async () => {
  const app = await createTestApp(":memory:");
  await jsonRequest(app, "POST", "/api/learners", {
    id: "learner-review",
    nativeLanguage: "hi",
    targetLanguage: "en",
    isAdult: true,
    phrases: [{ id: "phrase-review", skillId: "questions", targetText: "Could I have water?", language: "en" }],
  });
  await jsonRequest(app, "POST", "/api/sessions", { id: "session-review-1", learnerId: "learner-review" });
  await jsonRequest(app, "POST", "/api/sessions", { id: "session-review-2", learnerId: "learner-review" });
  for (const [id, sessionId, turnId] of [["review-e1", "session-review-1", "turn-1"], ["review-e2", "session-review-2", "turn-2"]] as const) {
    await jsonRequest(app, "POST", "/api/evidence", {
      id,
      learnerId: "learner-review",
      sessionId,
      itemId: "phrase-review",
      skillId: "questions",
      type: "attempted",
      outcome: "failure",
      confidence: 0.95,
      source: "conversation",
      context: { turnId },
      createdAt: id.endsWith("1") ? "2026-01-01T00:00:00.000Z" : "2026-01-02T00:00:00.000Z",
    });
  }
  const first = await app.inject({ method: "GET", url: "/api/learners/learner-review/review-queue" });
  const second = await app.inject({ method: "GET", url: "/api/learners/learner-review/review-queue" });
  assert.deepEqual(first.json(), second.json());
  assert.equal(first.json().items[0].reason, "repeated_error");
  await app.close();
});

test("invalid input and webhook authentication fail closed", async () => {
  const app = await createTestApp(":memory:", { ELEVENLABS_WEBHOOK_SECRET: "webhook-secret", LINGOFLOW_TOOL_SECRET: "tool-secret" });
  const invalid = await jsonRequest(app, "POST", "/api/learners", { nativeLanguage: "hi", isAdult: true });
  assert.equal(invalid.statusCode, 400);

  const body = JSON.stringify({ type: "user_transcript", event_id: "provider-event-1", conversation_id: "session-unknown", user_transcription_event: { user_transcript: "Hello" } });
  const missing = await jsonRequest(app, "POST", "/api/webhooks/elevenlabs", JSON.parse(body));
  assert.equal(missing.statusCode, 401);
  const signature = createWebhookSignature(body, "webhook-secret");
  const accepted = await jsonRequest(app, "POST", "/api/webhooks/elevenlabs", JSON.parse(body), { "elevenlabs-signature": signature, "idempotency-key": "provider-delivery-1" });
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.json().event.type, "learner_turn");
  const replay = await jsonRequest(app, "POST", "/api/webhooks/elevenlabs", JSON.parse(body), { "elevenlabs-signature": signature, "idempotency-key": "provider-delivery-1" });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().duplicate, true);

  await jsonRequest(app, "POST", "/api/learners", { id: "tool-learner", nativeLanguage: "hi", targetLanguage: "en", isAdult: true });
  await jsonRequest(app, "POST", "/api/sessions", { id: "tool-session", learnerId: "tool-learner" });
  const toolBody = JSON.stringify({ requestId: "tool-request-1", learnerId: "tool-learner", sessionId: "tool-session", args: {} });
  const unauthorizedTool = await jsonRequest(app, "POST", "/api/tools/get_current_objective", JSON.parse(toolBody));
  assert.equal(unauthorizedTool.statusCode, 401);
  const authorizedTool = await jsonRequest(app, "POST", "/api/tools/get_current_objective", JSON.parse(toolBody), { "x-lingoflow-tool-signature": createWebhookSignature(toolBody, "tool-secret") });
  assert.equal(authorizedTool.statusCode, 200);
  await app.close();
});
