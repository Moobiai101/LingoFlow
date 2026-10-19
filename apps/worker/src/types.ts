import type { D1Database, Fetcher, RateLimit } from "@cloudflare/workers-types";

export interface Env {
  readonly DB: D1Database;
  readonly ASSETS: Fetcher;
  readonly API_LIMITER?: RateLimit;
  readonly VOICE_LIMITER?: RateLimit;
  readonly LINGOFLOW_MODE?: string;
  readonly ELEVENLABS_API_KEY?: string;
  readonly ELEVENLABS_AGENT_ID?: string;
  readonly ELEVENLABS_VOICE_ID?: string;
  readonly ELEVENLABS_BASE_URL?: string;
  readonly LINGOFLOW_PROVIDER_TIMEOUT_MS?: string;
  readonly LINGOFLOW_PROVIDER_RETRIES?: string;
}

export interface D1Row {
  readonly [key: string]: unknown;
}
