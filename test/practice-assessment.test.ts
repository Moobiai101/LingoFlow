import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerPracticeRoutes } from "../apps/server/src/http/practice-routes.js";
import { SqliteRepository } from "../apps/server/src/persistence/index.js";
import { FakeAssessmentProvider } from "../packages/providers/dist/index.js";

const NOW = "2026-01-15T12:00:00.000Z";

function setup(provider = new FakeAssessmentProvider()) {
  const repository = new SqliteRepository({ path: ":memory:", now: () => NOW });
  repository.createLearner(
    { id: "learner-practice", nativeLanguage: "hi", targetLanguage: "en", level: "a2", isAdult: true },
    [],
    [{ id: "phrase-practice", skillId: "greetings", targetText: "Hello there", language: "en" }],
  );
  repository.createLearner(
    { id: "learner-other", nativeLanguage: "hi", targetLanguage: "en", level: "a2", isAdult: true },
    [],
    [{ id: "phrase-other", skillId: "greetings", targetText: "Good morning", language: "en" }],
  );
  repository.createSession({ id: "session-practice", learnerId: "learner-practice", targetLanguage: "en", nativeLanguage: "hi", startedAt: NOW });
  repository.createSession({ id: "session-other", learnerId: "learner-other", targetLanguage: "en", nativeLanguage: "hi", startedAt: NOW });
  const app = Fastify({ logger: false });
  registerPracticeRoutes(app, { repository, provider, now: () => NOW });
  return { app, repository, provider };
}

async function assess(app: ReturnType<typeof Fastify>, body: unknown) {
  return app.inject({
    method: "POST",
    url: "/api/practice/assess",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify(body),
  });
}

test("phrase practice returns complete evidence and offline transcript mode", async () => {
  const { app, repository, provider } = setup();
  const response = await assess(app, {
    learnerId: "learner-practice",
    sessionId: "session-practice",
    itemId: "phrase-practice",
    observed: " hello there ",
    requestId: "practice-request-1",
  });
  assert.equal(response.statusCode, 201);
  const body = response.json();
  assert.equal(body.mode, "offline_transcript");
  assert.equal(body.status, "complete");
  assert.equal(body.assessment.score, 1);
  assert.equal(body.evidence.event.type, "pronunciation_assessed");
  assert.equal(body.evidence.event.context.mode, "offline_transcript");
  assert.equal(body.evidence.event.context.rawAudio, undefined);
  assert.equal(provider.requests.length, 1);
  assert.equal(repository.evidenceForLearner("learner-practice").length, 1);
  await app.close();
  repository.close();
});

test("uncertain and failed transcript attempts do not invent a score", async () => {
  const { app, repository } = setup();
  const uncertain = await assess(app, {
    learnerId: "learner-practice", sessionId: "session-practice", itemId: "phrase-practice", observed: "yellow", requestId: "practice-uncertain",
  });
  assert.equal(uncertain.statusCode, 201);
  assert.equal(uncertain.json().status, "uncertain");
  assert.equal(uncertain.json().score, undefined);
  assert.equal(uncertain.json().assessment.score, undefined);

  const failed = await assess(app, {
    learnerId: "learner-practice", sessionId: "session-practice", itemId: "phrase-practice", observed: "", requestId: "practice-failed",
  });
  assert.equal(failed.statusCode, 201);
  assert.equal(failed.json().status, "failed");
  assert.equal(failed.json().score, undefined);
  assert.equal(failed.json().assessment.score, undefined);
  assert.equal(repository.evidenceForLearner("learner-practice").length, 2);
  await app.close();
  repository.close();
});

test("request ids are idempotent and ownership/reference validation fails closed", async () => {
  const { app, repository, provider } = setup();
  const input = { learnerId: "learner-practice", sessionId: "session-practice", itemId: "phrase-practice", observed: "Hello there", requestId: "practice-replay" };
  const first = await assess(app, input);
  const replay = await assess(app, { ...input, observed: "different text" });
  assert.equal(first.statusCode, 201);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.json().duplicate, true);
  assert.equal(replay.json().assessment.observed, "Hello there");
  assert.equal(provider.requests.length, 1);

  assert.equal((await assess(app, { ...input, requestId: "missing-session", sessionId: "not-a-session" })).statusCode, 404);
  assert.equal((await assess(app, { ...input, requestId: "missing-phrase", itemId: "not-a-phrase" })).statusCode, 404);
  assert.equal((await assess(app, { ...input, requestId: "wrong-owner", itemId: "phrase-other" })).statusCode, 400);
  assert.equal((await assess(app, { ...input, requestId: "wrong-session-owner", sessionId: "session-other" })).statusCode, 400);
  assert.equal((await assess(app, { ...input, requestId: "too-long", observed: "x".repeat(2_001) })).statusCode, 400);
  assert.equal(repository.evidenceForLearner("learner-practice").length, 1);
  await app.close();
  repository.close();
});
