import type { NormalizedVoiceEvent } from "../../contracts/dist/index.js";
import { PhraseReplayCache } from "./cache.js";
import type { LiveVoiceProvider, PhraseAudio, PhraseReplayRequest, VoiceSessionContext, VoiceSessionContextInput, VoiceSessionHandle } from "./ports.js";
export declare const ELEVENLABS_AGENT_MODEL: "eleven_flash_v2";
export declare const ELEVENLABS_PHRASE_MODEL: "eleven_v4";
export declare const ELEVENLABS_DEFAULT_BASE_URL = "https://api.elevenlabs.io";
export declare const ELEVENLABS_DEFAULT_TIMEOUT_MS = 12000;
export declare const ELEVENLABS_DEFAULT_RETRIES = 2;
type FetchLike = typeof fetch;
export interface ElevenLabsAgentContext extends VoiceSessionContext {
    readonly modelId: typeof ELEVENLABS_AGENT_MODEL;
    readonly dynamic_variables: Readonly<Record<string, string>>;
    readonly conversation_config_override: {
        readonly agent: {
            readonly prompt: {
                readonly prompt: string;
            };
        };
        readonly tts: {
            readonly model_id: typeof ELEVENLABS_AGENT_MODEL;
        };
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
export declare class MissingProviderCredentialsError extends Error {
    readonly code = "MISSING_PROVIDER_CREDENTIALS";
    constructor(provider: string, fields: readonly string[]);
}
export declare class ProviderRequestError extends Error {
    readonly code = "PROVIDER_REQUEST_FAILED";
    readonly status: number;
    constructor(status: number, message: string);
}
/** Build the compact, provider-specific context sent at agent connection time. */
export declare function buildElevenLabsSessionContext(input: VoiceSessionContextInput): ElevenLabsAgentContext;
export declare const createElevenLabsSessionContext: typeof buildElevenLabsSessionContext;
/** Convert ElevenLabs event payloads into the small internal event contract. */
export declare function normalizeElevenLabsEvent(payload: unknown, occurredAt?: string): NormalizedVoiceEvent | undefined;
export declare const normalizeVoiceEvent: typeof normalizeElevenLabsEvent;
export declare class ElevenLabsAgentProvider implements LiveVoiceProvider {
    readonly mode: "live";
    private readonly options;
    constructor(options: ElevenLabsOptions);
    createSessionContext(input: VoiceSessionContextInput): ElevenLabsAgentContext;
    connect(input: VoiceSessionContextInput): Promise<VoiceSessionHandle>;
    replayPhrase(request: PhraseReplayRequest): Promise<PhraseAudio>;
}
export declare class ElevenLabsPhraseReplayProvider {
    readonly mode: "live";
    private readonly options;
    private readonly cache;
    constructor(options: ElevenLabsOptions);
    replayPhrase(request: PhraseReplayRequest): Promise<PhraseAudio>;
    replay(request: PhraseReplayRequest): Promise<PhraseAudio>;
}
export {};
