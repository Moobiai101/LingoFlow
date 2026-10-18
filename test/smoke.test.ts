import assert from "node:assert/strict";
import test from "node:test";
import { app } from "../apps/server/src/index.js";

test("the API health endpoint is available offline", async () => {
  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: "ok", mode: "offline" });
});

test.after(async () => {
  await app.close();
});
