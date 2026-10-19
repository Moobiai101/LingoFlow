export type PendingWriteKind = "evidence" | "practice" | "transfer";

export interface PendingWrite {
  readonly key: string;
  readonly kind: PendingWriteKind;
  readonly learnerId: string;
  readonly sessionId: string;
  readonly payload: Record<string, unknown>;
}

export interface OutboxStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const OUTBOX_STORAGE_KEY = "lingoflow.pending-writes.v1";
export const MAX_PENDING_WRITES = 100;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keyFor(kind: PendingWriteKind, learnerId: string, sessionId: string, payload: Record<string, unknown>): string {
  const id = typeof payload.id === "string" && payload.id.trim().length > 0 ? payload.id : JSON.stringify(payload);
  return `${kind}:${learnerId}:${sessionId}:${id}`;
}

function read(storage: OutboxStorage): PendingWrite[] {
  try {
    const parsed = JSON.parse(storage.getItem(OUTBOX_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is PendingWrite => {
      if (!record(entry)) return false;
      return (entry.kind === "evidence" || entry.kind === "practice" || entry.kind === "transfer")
        && typeof entry.key === "string"
        && typeof entry.learnerId === "string"
        && typeof entry.sessionId === "string"
        && record(entry.payload);
    });
  } catch {
    return [];
  }
}

function write(storage: OutboxStorage, entries: readonly PendingWrite[]): void {
  try {
    storage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_PENDING_WRITES)));
  } catch {
    // Quota and private-browsing failures must not block the live interaction.
  }
}

export function pendingWrite(
  kind: PendingWriteKind,
  learnerId: string,
  sessionId: string,
  payload: Record<string, unknown>,
): PendingWrite {
  return { key: keyFor(kind, learnerId, sessionId, payload), kind, learnerId, sessionId, payload: { ...payload } };
}

export function enqueuePendingWrite(storage: OutboxStorage, entry: PendingWrite): void {
  const entries = read(storage).filter((candidate) => candidate.key !== entry.key);
  write(storage, [...entries, entry]);
}

export function pendingWritesFor(storage: OutboxStorage, learnerId: string, sessionId: string): readonly PendingWrite[] {
  return read(storage).filter((entry) => entry.learnerId === learnerId && entry.sessionId === sessionId);
}

export function removePendingWrite(storage: OutboxStorage, key: string): void {
  write(storage, read(storage).filter((entry) => entry.key !== key));
}

export async function flushPendingWrites(
  storage: OutboxStorage,
  learnerId: string,
  sessionId: string,
  send: (entry: PendingWrite) => Promise<boolean>,
): Promise<number> {
  let flushed = 0;
  for (const entry of pendingWritesFor(storage, learnerId, sessionId)) {
    let accepted = false;
    try {
      accepted = await send(entry);
    } catch {
      accepted = false;
    }
    if (!accepted) continue;
    removePendingWrite(storage, entry.key);
    flushed += 1;
  }
  return flushed;
}
