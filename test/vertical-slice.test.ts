import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../apps/server/src/index.js";

test("the offline vertical slice wires voice connect and phrase practice into the app", async () => {
  const app = createApp({
    environment: {
      ...process.env,
      LINGOFLOW_MODE: "offline",
      LINGOFLOW_DB_PATH: ":memory:",
    },
    now: () => "2026-01-15T12:00:00.000Z",
  });

  const learner = await app.inject({
    method: "POST",
    url: "/api/learners",
    payload: {
      id: "vertical-learner",
      nativeLanguage: "hi",
      targetLanguage: "en",
      level: "a2",
      isAdult: true,
      objectives: [{ id: "vertical-objective", title: "Cafe basics", skillIds: ["requests"] }],
      phrases: [{
        id: "vertical-phrase",
        skillId: "requests",
        objectiveId: "vertical-objective",
        targetText: "Could I have water?",
        translation: "क्या मुझे पानी मिल सकता है?",
        language: "en",
      }],
    },
  });
  assert.equal(learner.statusCode, 201);

  const session = await app.inject({
    method: "POST",
    url: "/api/sessions",
    payload: {
      id: "vertical-session",
      learnerId: "vertical-learner",
      objectiveId: "vertical-objective",
      nativeLanguage: "hi",
      targetLanguage: "en",
      startedAt: "2026-01-15T12:00:00.000Z",
    },
  });
  assert.equal(session.statusCode, 201);

  const voice = await app.inject({
    method: "POST",
    url: "/api/voice/connect",
    payload: {
      learnerId: "vertical-learner",
      sessionId: "vertical-session",
      itemId: "vertical-phrase",
      tutorPersonality: "patient mentor",
      roastMode: "off",
    },
  });
  assert.equal(voice.statusCode, 200);
  assert.equal(voice.json().mode, "offline");
  assert.equal(voice.json().status, "ready");
  assert.equal(voice.json().context.modelId, "fake_voice_v1");

  const assessment = await app.inject({
    method: "POST",
    url: "/api/practice/assess",
    payload: {
      learnerId: "vertical-learner",
      sessionId: "vertical-session",
      itemId: "vertical-phrase",
      observed: "Could I have water?",
      requestId: "vertical-practice-1",
    },
  });
  assert.equal(assessment.statusCode, 201);
  assert.equal(assessment.json().mode, "offline_transcript");
  assert.equal(assessment.json().status, "complete");
  assert.equal(assessment.json().assessment.score, 1);

  const summary = await app.inject({ method: "GET", url: "/api/learners/vertical-learner/summary" });
  assert.equal(summary.statusCode, 200);
  assert.equal(summary.json().evidenceCount, 1);

  await app.close();
});
