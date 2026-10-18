export interface IdempotencyEntry {
  readonly key: string;
  readonly expiresAt: number;
}

/** Small bounded in-memory store; replace with a durable store at deployment. */
export class IdempotencyStore {
  private readonly entries = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  public constructor(options: { readonly ttlMs?: number; readonly maxEntries?: number } = {}) {
    this.ttlMs = options.ttlMs ?? 10 * 60_000;
    this.maxEntries = options.maxEntries ?? 10_000;
  }

  /** Returns true for a first delivery and false for a replay. */
  public claim(key: string, now = Date.now()): boolean {
    const normalized = key.trim();
    if (!normalized) return false;
    this.prune(now);
    const previous = this.entries.get(normalized);
    if (previous !== undefined && previous > now) return false;
    this.entries.set(normalized, now + this.ttlMs);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return true;
  }

  public has(key: string, now = Date.now()): boolean {
    this.prune(now);
    const expiresAt = this.entries.get(key.trim());
    return expiresAt !== undefined && expiresAt > now;
  }

  public clear(): void {
    this.entries.clear();
  }

  private prune(now: number): void {
    for (const [key, expiresAt] of this.entries) {
      if (expiresAt <= now) this.entries.delete(key);
    }
  }
}

export const WebhookIdempotencyStore = IdempotencyStore;
