import type { JsonValue, NormalizedVoiceEvent } from "../../contracts/dist/index.js";
import { createPhraseReplayCacheKey, PhraseReplayCache } from "./cache.js";
import type {
  LiveVoiceProvider,
  PhraseAudio,
  PhraseReplayRequest,
  VoiceSessionContext,
  VoiceSessionContextInput,
  VoiceSessionHandle,
} from "./ports.js";

// The current ElevenLabs Agents create API rejects eleven_flash_v2_5 for
// English agents, so live conversation uses the accepted flash v2 model.
export const ELEVENLABS_AGENT_MODEL = "eleven_flash_v2" as const;
export const ELEVENLABS_PHRASE_MODEL = "eleven_v4" as const;
export const ELEVENLABS_DEFAULT_BASE_URL = "https://api.elevenlabs.io";
export const ELEVENLABS_DEFAULT_TIMEOUT_MS = 12_000;
export const ELEVENLABS_DEFAULT_RETRIES = 2;
const ELEVENLABS_DEFAULT_RETRY_DELAY_MS = 100;

type FetchLike = typeof fetch;

export interface ElevenLabsAgentContext extends VoiceSessionContext {
  readonly modelId: typeof ELEVENLABS_AGENT_MODEL;
  readonly dynamic_variables: Readonly<Record<string, string>>;
  readonly conversation_config_override: {
    readonly agent: { readonly prompt: { readonly prompt: string } };
    readonly tts: { readonly model_id: typeof ELEVENLABS_AGENT_MODEL };
  };
}

export interface ElevenLabsOptions {
  readonly apiKey?: string;
  readonly agentId?: string;
  readonly voiceId?: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: FetchLike;
  readonly mode?: "offline" | "live";
  readonly cache?: PhraseReplayCache;
  /** Abort a provider request after this many milliseconds. */
  readonly timeoutMs?: number;
  /** Number of retries for network, 408, 429, and 5xx failures. */
  readonly maxRetries?: number;
  /** Base delay between retries; exponential backoff is applied. */
  readonly retryDelayMs?: number;
}

export class MissingProviderCredentialsError extends Error {
  public readonly code = "MISSING_PROVIDER_CREDENTIALS";

  public constructor(provider: string, fields: readonly string[]) {
    super(`${provider} live mode requires ${fields.join(" and ")}. Set the value in the server environment.`);
    this.name = "MissingProviderCredentialsError";
  }
}

export class ProviderRequestError extends Error {
  public readonly code = "PROVIDER_REQUEST_FAILED";
  public readonly status: number;

  public constructor(status: number, message: string) {
    super(`ElevenLabs request failed (${status}): ${message}`);
    this.name = "ProviderRequestError";
    this.status = status;
  }
}

function requiredLive(options: ElevenLabsOptions, needsAgent: boolean): { apiKey: string; agentId?: string } {
  if (options.mode !== "live") {
    throw new Error("ElevenLabs live calls are disabled. Set LINGOFLOW_MODE=live to opt in.");
  }
  const missing = [
    ...(options.apiKey?.trim() ? [] : ["ELEVENLABS_API_KEY"]),
    ...(needsAgent && !options.agentId?.trim() ? ["ELEVENLABS_AGENT_ID"] : []),
  ];
  if (missing.length > 0) throw new MissingProviderCredentialsError("ElevenLabs", missing);
  return { apiKey: options.apiKey as string, agentId: options.agentId };
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function boundedNumber(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function retryDelay(options: ElevenLabsOptions, attempt: number): number {
  const base = boundedNumber(options.retryDelayMs, ELEVENLABS_DEFAULT_RETRY_DELAY_MS, 0, 5_000);
  return Math.min(5_000, base * (2 ** attempt));
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

/**
 * Keep provider calls bounded and retry only failures that may recover. The
 * caller still owns the final error mapping, so provider details never need to
 * cross the server boundary.
 */
async function fetchWithRecovery(
  options: ElevenLabsOptions,
  input: string,
  init: RequestInit,
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = boundedNumber(options.timeoutMs, ELEVENLABS_DEFAULT_TIMEOUT_MS, 1, 120_000);
  const maxRetries = boundedNumber(options.maxRetries, ELEVENLABS_DEFAULT_RETRIES, 0, 5);
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new globalThis.AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(input, { ...init, signal: controller.signal });
      if (!retryableStatus(response.status) || attempt === maxRetries) return response;
      lastError = new ProviderRequestError(response.status, "transient provider failure");
      try {
        await response.body?.cancel();
      } catch {
        // Releasing a failed response is best effort; retry policy is unchanged.
      }
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) throw error;
    } finally {
      globalThis.clearTimeout(timer);
    }
    await wait(retryDelay(options, attempt));
  }

  throw lastError instanceof Error ? lastError : new Error("ElevenLabs request failed");
}

function stringValue(value: string | number | undefined): string {
  return value === undefined ? "" : String(value);
}

/** Build the compact, provider-specific context sent at agent connection time. */
export function buildElevenLabsSessionContext(input: VoiceSessionContextInput): ElevenLabsAgentContext {
  const { request, learner, objective, activeItem, topErrorPatterns = [], reviewItem } = input;
  const roastEnabled = learner.isAdult && input.roastMode === "friendly";
  const dynamicVariables: Record<string, string> = {
    learner_id: request.learnerId,
    session_id: request.sessionId,
    target_language: request.targetLanguage,
    native_language: request.nativeLanguage,
    learner_level: stringValue(learner.level),
    learner_name: learner.displayName ?? "learner",
    current_objective: objective?.title ?? "",
    current_objective_description: objective?.description ?? "",
    active_phrase: activeItem?.targetText ?? "",
    active_phrase_translation: activeItem?.translation ?? "",
    active_phrase_language: activeItem?.language ?? request.targetLanguage,
    top_error_pattern_1: topErrorPatterns[0] ?? "",
    top_error_pattern_2: topErrorPatterns[1] ?? "",
    review_item_id: reviewItem?.id ?? "",
    review_reason: reviewItem?.reason ?? "",
    tutor_personality: input.tutorPersonality ?? "patient mentor",
    roast_mode: roastEnabled ? "friendly" : "off",
    roast_enabled: roastEnabled ? "true" : "false",
  };
  const systemPrompt = [
    "You are the LingoFlow language tutor.",
    `Teach ${request.targetLanguage} to a ${learner.level} learner whose native language is ${request.nativeLanguage}.`,
    "Correct one useful error at a time, preserve momentum, and never claim an assessment that was not returned by a provider.",
    roastEnabled
      ? "Friendly roast mode is enabled only for this adult learner: tease the attempt, never the person, then teach the correction."
      : "Roast mode is off; use a respectful coaching tone.",
  ].join(" ");
  return {
    sessionId: request.sessionId,
    learnerId: request.learnerId,
    modelId: ELEVENLABS_AGENT_MODEL,
    dynamicVariables,
    systemPrompt,
    dynamic_variables: dynamicVariables,
    conversation_config_override: {
      agent: { prompt: { prompt: systemPrompt } },
      tts: { model_id: ELEVENLABS_AGENT_MODEL },
    },
  };
}

export const createElevenLabsSessionContext = buildElevenLabsSessionContext;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function eventTime(value: unknown): string {
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(millis);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function jsonValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(jsonValue).filter((entry): entry is JsonValue => entry !== undefined);
  const record = asRecord(value);
  if (!record) return undefined;
  const output: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(record)) {
    const normalized = jsonValue(entry);
    if (normalized !== undefined) output[key] = normalized;
  }
  return output;
}

/** Convert ElevenLabs event payloads into the small internal event contract. */
export function normalizeElevenLabsEvent(payload: unknown, occurredAt?: string): NormalizedVoiceEvent | undefined {
  const root = asRecord(payload);
  if (!root) return undefined;
  const eventType = firstString(root.type, root.event, root.event_type);
  if (!eventType) return undefined;
  const userEvent = asRecord(root.user_transcription_event) ?? asRecord(root.user_transcript_event);
  const agentEvent = asRecord(root.agent_response_event) ?? asRecord(root.agent_response);
  const text = firstString(
    root.text,
    root.transcript,
    root.user_transcript,
    root.agent_response,
    userEvent?.user_transcript,
    userEvent?.transcript,
    agentEvent?.agent_response,
    agentEvent?.response,
  );
  const sessionId = firstString(root.session_id, root.conversation_id, root.conversationId) ?? "unknown-session";
  const id = firstString(root.event_id, root.id) ?? `${eventType}:${sessionId}:${text ?? ""}`;
  const at = occurredAt ?? eventTime(root.timestamp ?? root.created_at ?? root.createdAt);
  const providerMetadata: Record<string, JsonValue> = { provider_event_type: eventType };
  for (const [key, value] of Object.entries(root)) {
    if (["type", "event", "event_type", "text", "transcript", "user_transcript", "agent_response"].includes(key)) continue;
    const normalized = jsonValue(value);
    if (normalized !== undefined) providerMetadata[key] = normalized;
  }
  const metadata = providerMetadata;
  if (["user_transcript", "user_transcription", "user_transcription_event"].includes(eventType)) {
    return { id, sessionId, type: "learner_turn", text: text ?? "", occurredAt: at, provider: "elevenlabs", metadata };
  }
  if (["agent_response", "agent_response_event", "agent_response_correction"].includes(eventType)) {
    return { id, sessionId, type: "tutor_turn", text: text ?? "", occurredAt: at, provider: "elevenlabs", metadata };
  }
  if (["conversation_initiation_metadata", "conversation_started", "session_started"].includes(eventType)) {
    return { id, sessionId, type: "session_started", state: "connecting", occurredAt: at, provider: "elevenlabs", metadata };
  }
  if (["interruption", "user_interruption", "agent_interrupted"].includes(eventType)) {
    return { id, sessionId, type: "interrupted", state: "interrupted", occurredAt: at, provider: "elevenlabs", metadata };
  }
  if (["error", "agent_error", "provider_error"].includes(eventType)) {
    return { id, sessionId, type: "provider_error", occurredAt: at, provider: "elevenlabs", metadata };
  }
  if (["conversation_end", "session_ended", "conversation_ended"].includes(eventType)) {
    return { id, sessionId, type: "session_ended", state: "session_complete", occurredAt: at, provider: "elevenlabs", metadata };
  }
  if (["state_change", "state_changed"].includes(eventType)) {
    const state = firstString(root.state, root.status);
    const knownStates = new Set(["idle", "requesting_microphone", "connecting", "listening", "learner_speaking", "tutor_thinking", "tutor_speaking", "interrupted", "reconnecting", "text_fallback", "session_complete"]);
    return {
      id,
      sessionId,
      type: "state_changed",
      state: state && knownStates.has(state) ? state as NormalizedVoiceEvent["state"] : "connecting",
      occurredAt: at,
      provider: "elevenlabs",
      metadata,
    };
  }
  return undefined;
}

export const normalizeVoiceEvent = normalizeElevenLabsEvent;

export class ElevenLabsAgentProvider implements LiveVoiceProvider {
  public readonly mode = "live" as const;
  private readonly options: ElevenLabsOptions;

  public constructor(options: ElevenLabsOptions) {
    this.options = { ...options, mode: options.mode ?? "live" };
  }

  public createSessionContext(input: VoiceSessionContextInput): ElevenLabsAgentContext {
    return buildElevenLabsSessionContext(input);
  }

  public async connect(input: VoiceSessionContextInput): Promise<VoiceSessionHandle> {
    const credentials = requiredLive(this.options, true);
    const baseUrl = this.options.baseUrl ?? ELEVENLABS_DEFAULT_BASE_URL;
    const response = await fetchWithRecovery(this.options, `${baseUrl}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(credentials.agentId as string)}`, {
      method: "GET",
      headers: { "xi-api-key": credentials.apiKey, accept: "application/json" },
    });
    if (!response.ok) throw new ProviderRequestError(response.status, await response.text());
    const data = asRecord(await response.json());
    const signedUrl = typeof data?.signed_url === "string" ? data.signed_url : undefined;
    if (!signedUrl) throw new ProviderRequestError(502, "ElevenLabs did not return a signed_url");
    return { signedUrl, context: buildElevenLabsSessionContext(input) };
  }

  public async replayPhrase(request: PhraseReplayRequest): Promise<PhraseAudio> {
    return new ElevenLabsPhraseReplayProvider(this.options).replayPhrase(request);
  }
}

export class ElevenLabsPhraseReplayProvider {
  public readonly mode = "live" as const;
  private readonly options: ElevenLabsOptions;
  private readonly cache: PhraseReplayCache;

  public constructor(options: ElevenLabsOptions) {
    this.options = { ...options, mode: options.mode ?? "live" };
    this.cache = options.cache ?? new PhraseReplayCache();
  }

  public async replayPhrase(request: PhraseReplayRequest): Promise<PhraseAudio> {
    const voiceId = request.voiceId || this.options.voiceId;
    if (!voiceId) throw new MissingProviderCredentialsError("ElevenLabs phrase replay", ["voiceId"]);
    const cacheKey = createPhraseReplayCacheKey({ ...request, voiceId, modelId: ELEVENLABS_PHRASE_MODEL });
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const credentials = requiredLive(this.options, false);
    const baseUrl = this.options.baseUrl ?? ELEVENLABS_DEFAULT_BASE_URL;
    const response = await fetchWithRecovery(this.options, `${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
      method: "POST",
      headers: {
        "xi-api-key": credentials.apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: request.text,
        model_id: ELEVENLABS_PHRASE_MODEL,
        language_code: request.language,
        ...(request.speed === undefined ? {} : { speed: request.speed }),
      }),
    });
    if (!response.ok) throw new ProviderRequestError(response.status, await response.text());
    const audio = new Uint8Array(await response.arrayBuffer());
    const result: PhraseAudio = { cacheKey, audio, contentType: response.headers.get("content-type") ?? "audio/mpeg", modelId: ELEVENLABS_PHRASE_MODEL };
    this.cache.set(result);
    return result;
  }

  public async replay(request: PhraseReplayRequest): Promise<PhraseAudio> {
    return this.replayPhrase(request);
  }
}
