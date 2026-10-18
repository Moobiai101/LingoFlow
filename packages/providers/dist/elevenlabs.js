import { createPhraseReplayCacheKey, PhraseReplayCache } from "./cache.js";
export const ELEVENLABS_AGENT_MODEL = "eleven_flash_v2_5";
export const ELEVENLABS_PHRASE_MODEL = "eleven_v4";
export const ELEVENLABS_DEFAULT_BASE_URL = "https://api.elevenlabs.io";
export class MissingProviderCredentialsError extends Error {
    code = "MISSING_PROVIDER_CREDENTIALS";
    constructor(provider, fields) {
        super(`${provider} live mode requires ${fields.join(" and ")}. Set the value in the server environment.`);
        this.name = "MissingProviderCredentialsError";
    }
}
export class ProviderRequestError extends Error {
    code = "PROVIDER_REQUEST_FAILED";
    status;
    constructor(status, message) {
        super(`ElevenLabs request failed (${status}): ${message}`);
        this.name = "ProviderRequestError";
        this.status = status;
    }
}
function requiredLive(options, needsAgent) {
    if (options.mode !== "live") {
        throw new Error("ElevenLabs live calls are disabled. Set LINGOFLOW_MODE=live to opt in.");
    }
    const missing = [
        ...(options.apiKey?.trim() ? [] : ["ELEVENLABS_API_KEY"]),
        ...(needsAgent && !options.agentId?.trim() ? ["ELEVENLABS_AGENT_ID"] : []),
    ];
    if (missing.length > 0)
        throw new MissingProviderCredentialsError("ElevenLabs", missing);
    return { apiKey: options.apiKey, agentId: options.agentId };
}
function stringValue(value) {
    return value === undefined ? "" : String(value);
}
/** Build the compact, provider-specific context sent at agent connection time. */
export function buildElevenLabsSessionContext(input) {
    const { request, learner, objective, activeItem, topErrorPatterns = [], reviewItem } = input;
    const roastEnabled = learner.isAdult && input.roastMode === "friendly";
    const dynamicVariables = {
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
function asRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function firstString(...values) {
    return values.find((value) => typeof value === "string" && value.length > 0);
}
function eventTime(value) {
    if (typeof value === "string" && !Number.isNaN(Date.parse(value)))
        return new Date(value).toISOString();
    if (typeof value === "number" && Number.isFinite(value)) {
        const millis = value < 1_000_000_000_000 ? value * 1000 : value;
        const date = new Date(millis);
        if (!Number.isNaN(date.getTime()))
            return date.toISOString();
    }
    return new Date().toISOString();
}
function jsonValue(value) {
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        return value;
    if (Array.isArray(value))
        return value.map(jsonValue).filter((entry) => entry !== undefined);
    const record = asRecord(value);
    if (!record)
        return undefined;
    const output = {};
    for (const [key, entry] of Object.entries(record)) {
        const normalized = jsonValue(entry);
        if (normalized !== undefined)
            output[key] = normalized;
    }
    return output;
}
/** Convert ElevenLabs event payloads into the small internal event contract. */
export function normalizeElevenLabsEvent(payload, occurredAt) {
    const root = asRecord(payload);
    if (!root)
        return undefined;
    const eventType = firstString(root.type, root.event, root.event_type);
    if (!eventType)
        return undefined;
    const userEvent = asRecord(root.user_transcription_event) ?? asRecord(root.user_transcript_event);
    const agentEvent = asRecord(root.agent_response_event) ?? asRecord(root.agent_response);
    const text = firstString(root.text, root.transcript, root.user_transcript, root.agent_response, userEvent?.user_transcript, userEvent?.transcript, agentEvent?.agent_response, agentEvent?.response);
    const sessionId = firstString(root.session_id, root.conversation_id, root.conversationId) ?? "unknown-session";
    const id = firstString(root.event_id, root.id) ?? `${eventType}:${sessionId}:${text ?? ""}`;
    const at = occurredAt ?? eventTime(root.timestamp ?? root.created_at ?? root.createdAt);
    const providerMetadata = { provider_event_type: eventType };
    for (const [key, value] of Object.entries(root)) {
        if (["type", "event", "event_type", "text", "transcript", "user_transcript", "agent_response"].includes(key))
            continue;
        const normalized = jsonValue(value);
        if (normalized !== undefined)
            providerMetadata[key] = normalized;
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
            state: state && knownStates.has(state) ? state : "connecting",
            occurredAt: at,
            provider: "elevenlabs",
            metadata,
        };
    }
    return undefined;
}
export const normalizeVoiceEvent = normalizeElevenLabsEvent;
export class ElevenLabsAgentProvider {
    mode = "live";
    options;
    constructor(options) {
        this.options = { ...options, mode: options.mode ?? "live" };
    }
    createSessionContext(input) {
        return buildElevenLabsSessionContext(input);
    }
    async connect(input) {
        const credentials = requiredLive(this.options, true);
        const fetchImpl = this.options.fetchImpl ?? globalThis.fetch;
        const baseUrl = this.options.baseUrl ?? ELEVENLABS_DEFAULT_BASE_URL;
        const response = await fetchImpl(`${baseUrl}/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(credentials.agentId)}`, {
            method: "GET",
            headers: { "xi-api-key": credentials.apiKey, accept: "application/json" },
        });
        if (!response.ok)
            throw new ProviderRequestError(response.status, await response.text());
        const data = asRecord(await response.json());
        const signedUrl = typeof data?.signed_url === "string" ? data.signed_url : undefined;
        if (!signedUrl)
            throw new ProviderRequestError(502, "ElevenLabs did not return a signed_url");
        return { signedUrl, context: buildElevenLabsSessionContext(input) };
    }
    async replayPhrase(request) {
        return new ElevenLabsPhraseReplayProvider(this.options).replayPhrase(request);
    }
}
export class ElevenLabsPhraseReplayProvider {
    mode = "live";
    options;
    cache;
    constructor(options) {
        this.options = { ...options, mode: options.mode ?? "live" };
        this.cache = options.cache ?? new PhraseReplayCache();
    }
    async replayPhrase(request) {
        const voiceId = request.voiceId || this.options.voiceId;
        if (!voiceId)
            throw new MissingProviderCredentialsError("ElevenLabs phrase replay", ["voiceId"]);
        const cacheKey = createPhraseReplayCacheKey({ ...request, voiceId, modelId: ELEVENLABS_PHRASE_MODEL });
        const cached = this.cache.get(cacheKey);
        if (cached)
            return cached;
        const credentials = requiredLive(this.options, false);
        const fetchImpl = this.options.fetchImpl ?? globalThis.fetch;
        const baseUrl = this.options.baseUrl ?? ELEVENLABS_DEFAULT_BASE_URL;
        const response = await fetchImpl(`${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
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
        if (!response.ok)
            throw new ProviderRequestError(response.status, await response.text());
        const audio = new Uint8Array(await response.arrayBuffer());
        const result = { cacheKey, audio, contentType: response.headers.get("content-type") ?? "audio/mpeg", modelId: ELEVENLABS_PHRASE_MODEL };
        this.cache.set(result);
        return result;
    }
    async replay(request) {
        return this.replayPhrase(request);
    }
}
//# sourceMappingURL=elevenlabs.js.map