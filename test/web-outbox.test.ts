import assert from "node:assert/strict";
import test from "node:test";
import {
  enqueuePendingWrite,
  flushPendingWrites,
  MAX_PENDING_WRITES,
  pendingWrite,
  pendingWritesFor,
  type OutboxStorage,
} from "../apps/web/src/components/outbox.js";

class MemoryStorage implements OutboxStorage {
  private value: string | null = null;

  public getItem(): string | null {
    return this.value;
  }

  public setItem(_key: string, value: string): void {
    this.value = value;
  }
}

test("the browser outbox deduplicates writes and stays bounded", () => {
  const storage = new MemoryStorage();
  enqueuePendingWrite(storage, pendingWrite("evidence", "learner", "session", { id: "same", observed: "first" }));
  enqueuePendingWrite(storage, pendingWrite("evidence", "learner", "session", { id: "same", observed: "latest" }));
  for (let index = 0; index < MAX_PENDING_WRITES + 5; index += 1) {
    enqueuePendingWrite(storage, pendingWrite("evidence", "learner", "session", { id: `event-${index}` }));
  }
  const entries = pendingWritesFor(storage, "learner", "session");
  assert.equal(entries.length, MAX_PENDING_WRITES);
  assert.equal(entries.some((entry) => entry.payload.observed === "latest"), false);
  assert.equal(entries.at(-1)?.payload.id, `event-${MAX_PENDING_WRITES + 4}`);
});

test("the browser outbox removes acknowledged writes and retains failed writes", async () => {
  const storage = new MemoryStorage();
  enqueuePendingWrite(storage, pendingWrite("evidence", "learner", "session", { id: "accepted" }));
  enqueuePendingWrite(storage, pendingWrite("transfer", "learner", "session", { id: "retry" }));
  const flushed = await flushPendingWrites(storage, "learner", "session", async (entry) => entry.payload.id === "accepted");
  assert.equal(flushed, 1);
  const remaining = pendingWritesFor(storage, "learner", "session");
  assert.deepEqual(remaining.map((entry) => entry.payload.id), ["retry"]);
});
