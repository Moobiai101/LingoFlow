import assert from "node:assert/strict";
import test from "node:test";
import {
  bodyRecord,
  MAX_REQUEST_BODY_BYTES,
  WorkerPayloadTooLargeError,
} from "../apps/worker/src/validation.js";

test("Worker JSON validation accepts bounded request bodies", async () => {
  const body = await bodyRecord(new Request("https://lingoflow.test/api/health", {
    method: "POST",
    body: JSON.stringify({ learnerId: "learner-1" }),
    headers: { "content-type": "application/json" },
  }));
  assert.deepEqual(body, { learnerId: "learner-1" });
});

test("Worker JSON validation rejects oversized declared and streamed bodies", async () => {
  const oversized = "x".repeat(MAX_REQUEST_BODY_BYTES + 1);
  await assert.rejects(
    bodyRecord(new Request("https://lingoflow.test/api/health", {
      method: "POST",
      body: oversized,
      headers: { "content-type": "application/json", "content-length": String(oversized.length) },
    })),
    WorkerPayloadTooLargeError,
  );
});
