import type { ExecutionContext, ExportedHandler } from "@cloudflare/workers-types";
import {
  ElevenLabsAgentProvider,
  ElevenLabsPhraseReplayProvider,
  FakeVoiceProvider,
  MissingProviderCredentialsError,
  ProviderRequestError,
} from "../../../packages/providers/dist/index.js";
import type { PhraseReplayRequest, VoiceSessionContextInput } from "../../../packages/providers/dist/index.js";
import { evaluateTransfer, validateEvidenceEvent } from "../../../packages/domain/dist/index.js";
import type { EvidenceEvent, PronunciationAssessment } from "../../../packages/contracts/dist/index.js";
import { D1Repository, WorkerConflictError, WorkerNotFoundError } from "./d1-repository.js";
import type { Env } from "./types.js";
import {
  asRecord,
  bodyRecord,
  booleanValue,
  enumValue,
  isoDateValue,
  numberValue,
  optionalRecord,
  optionalString,
  requiredBoolean,
  requiredString,
  stringArray,
  WorkerInputError,
  WorkerPayloadTooLargeError,
  type JsonRecord,
} from "./validation.js";

const EVIDENCE_TYPES = ["understood", "attempted", "corrected", "recalled", "pronunciation_assessed", "hint_required", "retry_success", "transfer_success", "transfer_failure"] as const;
const OUTCOMES = ["success", "failure", "uncertain", "correct", "incorrect"] as const;
const SOURCES = ["conversation", "assessment", "review", "transfer", "system", "import"] as const;
const SESSION_STATUSES = ["active", "completed", "cancelled"] as const;
const OBJECTIVE_STATUSES = ["active", "completed", "paused"] as const;
const PRACTICE_MODE = "offline_transcript" as const;
const VOICE_LIMITED_PATHS = new Set([
  "/api/voice/session-context",
  "/api/voice/connect",
  "/api/voice/replay",
]);
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "permissions-policy": "microphone=(self)",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
} as const;

function now(): string {
  return new Date().toISOString();
}

function mode(env: Env): "offline" | "live" {
  return env.LINGOFLOW_MODE === "live" ? "live" : "offline";
}

function boundedEnvNumber(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(parsed)));
}

function providerOptions(env: Env): {
  readonly mode: "offline" | "live";
  readonly apiKey?: string;
  readonly agentId?: string;
  readonly voiceId?: string;
  readonly baseUrl?: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
} {
  return {
    mode: mode(env),
    ...(env.ELEVENLABS_API_KEY ? { apiKey: env.ELEVENLABS_API_KEY } : {}),
    ...(env.ELEVENLABS_AGENT_ID ? { agentId: env.ELEVENLABS_AGENT_ID } : {}),
    ...(env.ELEVENLABS_VOICE_ID ? { voiceId: env.ELEVENLABS_VOICE_ID } : {}),
    ...(env.ELEVENLABS_BASE_URL ? { baseUrl: env.ELEVENLABS_BASE_URL } : {}),
    timeoutMs: boundedEnvNumber(env.LINGOFLOW_PROVIDER_TIMEOUT_MS, 12_000, 1, 120_000),
    maxRetries: boundedEnvNumber(env.LINGOFLOW_PROVIDER_RETRIES, 2, 0, 5),
  };
}

function headers(contentType = "application/json; charset=utf-8"): Headers {
  return new Headers({
    "content-type": contentType,
    "cache-control": "no-store",
    ...SECURITY_HEADERS,
  });
}

function jsonResponse(value: unknown, status = 200, extra?: HeadersInit): Response {
  const responseHeaders = headers();
  if (extra) new Headers(extra).forEach((value, key) => responseHeaders.set(key, value));
  return new Response(JSON.stringify(value), { status, headers: responseHeaders });
}

function errorResponse(error: unknown): Response {
  if (error instanceof WorkerPayloadTooLargeError) return jsonResponse({ error: error.code, message: error.message }, 413);
  if (error instanceof WorkerInputError) return jsonResponse({ error: error.code, message: error.message }, 400);
  if (error instanceof WorkerNotFoundError) return jsonResponse({ error: error.code, message: error.message }, 404);
  if (error instanceof WorkerConflictError) return jsonResponse({ error: error.code, message: error.message }, 409);
  return jsonResponse({ error: "INTERNAL_ERROR", message: "The request could not be completed" }, 500);
}

function requestIdFor(request: Request): string {
  const candidate = request.headers.get("x-request-id")?.trim();
  return candidate && /^[A-Za-z0-9._:-]{1,128}$/.test(candidate) ? candidate : crypto.randomUUID();
}

function withResponseHeaders(response: Response, requestId: string): Response {
  const responseHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) responseHeaders.set(key, value);
  responseHeaders.set("x-request-id", requestId);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
}

function rateLimitKey(request: Request, path: string): string {
  const clientAddress = request.headers.get("cf-connecting-ip")?.trim() || "unknown-client";
  return `${clientAddress}:${path}`;
}

async function rateLimitResponse(request: Request, env: Env): Promise<Response | undefined> {
  const path = routePath(request);
  if (request.method === "OPTIONS" || request.method === "GET" || path === "/api/health" || !path.startsWith("/api/")) return undefined;
  const limiter = VOICE_LIMITED_PATHS.has(path) ? env.VOICE_LIMITER ?? env.API_LIMITER : env.API_LIMITER;
  if (!limiter) return undefined;
  const outcome = await limiter.limit({ key: rateLimitKey(request, path) });
  if (outcome.success) return undefined;
  return jsonResponse(
    {
      error: "RATE_LIMITED",
      message: VOICE_LIMITED_PATHS.has(path)
        ? "Voice requests are temporarily rate-limited. Continue with text practice or try again shortly."
        : "Requests are temporarily rate-limited. Try again shortly.",
    },
    429,
    { "retry-after": "60" },
  );
}

function idOrRandom(body: JsonRecord, key = "id"): string {
  return optionalString(body, key, 200) ?? crypto.randomUUID();
}

function parseObjective(value: unknown, learnerId: string): {
  readonly id: string;
  readonly learnerId: string;
  readonly title: string;
  readonly description?: string;
  readonly skillIds: readonly string[];
  readonly status: "active" | "completed" | "paused";
  readonly targetDate?: string;
} {
  const body = asRecord(value);
  const description = optionalString(body, "description", 2_000);
  const targetDate = optionalString(body, "targetDate", 80);
  return {
    id: idOrRandom(body),
    learnerId,
    title: requiredString(body, "title", 240),
    ...(description ? { description } : {}),
    skillIds: stringArray(body, "skillIds"),
    status: enumValue(body, "status", OBJECTIVE_STATUSES, "active"),
    ...(targetDate ? { targetDate: isoDateValue({ targetDate }, "targetDate") } : {}),
  };
}

function parsePhrase(value: unknown, learnerId: string): {
  readonly id: string;
  readonly learnerId: string;
  readonly skillId: string;
  readonly objectiveId?: string;
  readonly targetText: string;
  readonly translation?: string;
  readonly language: string;
  readonly context?: string;
  readonly difficulty?: number;
  readonly contentVersion?: string;
} {
  const body = asRecord(value);
  const objectiveId = optionalString(body, "objectiveId", 200);
  const translation = optionalString(body, "translation", 2_000);
  const context = optionalString(body, "context", 2_000);
  const contentVersion = optionalString(body, "contentVersion", 100);
  const difficulty = body.difficulty === undefined ? undefined : numberValue(body, "difficulty");
  return {
    id: idOrRandom(body),
    learnerId,
    skillId: requiredString(body, "skillId", 200),
    ...(objectiveId ? { objectiveId } : {}),
    targetText: requiredString(body, "targetText", 2_000),
    ...(translation ? { translation } : {}),
    language: requiredString(body, "language", 40),
    ...(context ? { context } : {}),
    ...(difficulty === undefined ? {} : { difficulty }),
    ...(contentVersion ? { contentVersion } : {}),
  };
}

function routePath(request: Request): string {
  return new URL(request.url).pathname;
}

function fallbackFor(error: unknown): { readonly code: "missing_credentials" | "provider_unavailable" | "rate_limited"; readonly message: string; readonly mode: "text_fallback" } {
  const code = error instanceof MissingProviderCredentialsError
    ? "missing_credentials"
    : error instanceof ProviderRequestError && error.status === 429
      ? "rate_limited"
      : "provider_unavailable";
  return {
    code,
    mode: "text_fallback",
    message: code === "missing_credentials"
      ? "Live voice is not configured. Continue with text practice or configure ElevenLabs credentials."
      : code === "rate_limited"
        ? "Live voice is temporarily rate-limited. Wait a moment, then try again or continue with text practice."
        : "Live voice is unavailable. Continue with text practice while voice is restored.",
  };
}

async function voiceContextInput(repo: D1Repository, body: JsonRecord): Promise<VoiceSessionContextInput> {
  const learnerId = requiredString(body, "learnerId", 200);
  const sessionId = requiredString(body, "sessionId", 200);
  const learner = await repo.requireLearner(learnerId);
  const session = await repo.requireSession(sessionId);
  if (session.learnerId !== learner.id) throw new WorkerInputError("sessionId does not belong to learnerId");
  const objectiveId = optionalString(body, "objectiveId", 200) ?? session.objectiveId;
  const itemId = optionalString(body, "itemId", 200);
  const objective = objectiveId ? await repo.getObjective(objectiveId) : undefined;
  const activeItem = itemId ? await repo.getPhrase(itemId) : undefined;
  const queue = await repo.getReviewQueue(learnerId, now());
  const reviewItem = queue.find((item) => item.itemId === itemId) ?? queue[0];
  const summary = await repo.getSummary(learnerId);
  const topErrorPatterns = summary.skills
    .filter((skill) => skill.errorCount > 0)
    .sort((left, right) => right.priorityScore - left.priorityScore || left.skillId.localeCompare(right.skillId))
    .slice(0, 2)
    .map((skill) => skill.skillId);
  const requestedRoast = enumValue(body, "roastMode", ["off", "friendly"] as const, "off");
  const roastMode = learner.isAdult && learner.roastOptIn === true ? requestedRoast : "off";
  return {
    request: {
      sessionId,
      learnerId,
      targetLanguage: session.targetLanguage,
      nativeLanguage: session.nativeLanguage,
      ...(objectiveId ? { objectiveId } : {}),
      ...(itemId ? { itemId } : {}),
    },
    learner: { level: learner.level, ...(learner.displayName ? { displayName: learner.displayName } : {}), isAdult: learner.isAdult },
    ...(objective ? { objective: { title: objective.title, ...(objective.description ? { description: objective.description } : {}) } } : {}),
    ...(activeItem ? { activeItem: { targetText: activeItem.targetText, ...(activeItem.translation ? { translation: activeItem.translation } : {}), language: activeItem.language } } : {}),
    topErrorPatterns,
    ...(reviewItem ? { reviewItem } : {}),
    tutorPersonality: optionalString(body, "tutorPersonality", 80) ?? "patient mentor",
    roastMode,
  };
}

async function connectVoice(request: Request, env: Env): Promise<Response> {
  const body = await bodyRecord(request);
  const input = await voiceContextInput(new D1Repository(env.DB), body);
  if (mode(env) === "offline") {
    const context = new FakeVoiceProvider().createSessionContext(input);
    return jsonResponse({ mode: "offline", status: "ready", fallback: false, context });
  }
  const provider = new ElevenLabsAgentProvider(providerOptions(env));
  const context = provider.createSessionContext(input);
  if (body.connect === false) return jsonResponse({ mode: "live", status: "ready", fallback: false, context });
  try {
    const handle = await provider.connect(input);
    return jsonResponse({ mode: "live", status: "ready", fallback: false, context: handle.context, signedUrl: handle.signedUrl });
  } catch (error) {
    return jsonResponse({ mode: "live", status: "text_fallback", fallback: true, context, fallbackDetails: fallbackFor(error) });
  }
}

async function voiceSessionContext(request: Request, env: Env): Promise<Response> {
  const body = await bodyRecord(request);
  const input = await voiceContextInput(new D1Repository(env.DB), body);
  const context = mode(env) === "live"
    ? new ElevenLabsAgentProvider(providerOptions(env)).createSessionContext(input)
    : new FakeVoiceProvider().createSessionContext(input);
  return jsonResponse({ mode: mode(env), context });
}

async function cacheKeyFor(request: PhraseReplayRequest, origin: string): Promise<Request> {
  const source = `${request.phraseId}\n${request.text}\n${request.language}\n${request.voiceId}\n${request.contentVersion}\n${request.speed ?? 1}\neleven_v4`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  const hash = [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  return new Request(`${origin}/__lingoflow/cache/phrase/${hash}`);
}

async function replayPhrase(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await bodyRecord(request);
  const phraseId = requiredString(body, "phraseId", 200);
  const textValue = requiredString(body, "text", 2_000);
  const language = requiredString(body, "language", 40);
  const voiceId = optionalString(body, "voiceId", 200) ?? env.ELEVENLABS_VOICE_ID ?? "fake";
  const contentVersion = optionalString(body, "contentVersion", 100) ?? "1";
  const speed = body.speed === undefined ? undefined : numberValue(body, "speed");
  if (speed !== undefined && (speed <= 0 || speed > 2)) throw new WorkerInputError("speed must be greater than 0 and no greater than 2");
  const replayRequest: PhraseReplayRequest = { phraseId, text: textValue, language, voiceId, contentVersion, ...(speed === undefined ? {} : { speed }) };
  if (mode(env) === "live") {
    const cacheRequest = await cacheKeyFor(replayRequest, new URL(request.url).origin);
    const cacheStore = (caches as unknown as { readonly default: Cache }).default;
    const cached = await cacheStore.match(cacheRequest);
    if (cached) return cached;
    try {
      const audio = await new ElevenLabsPhraseReplayProvider(providerOptions(env)).replayPhrase(replayRequest);
      const audioBytes = new Uint8Array(audio.audio);
      const response = new Response(audioBytes.buffer as ArrayBuffer, { status: 200, headers: headers(audio.contentType) });
      response.headers.set("cache-control", "public, max-age=31536000, immutable");
      response.headers.set("x-lingoflow-mode", "live");
      response.headers.set("x-lingoflow-model", audio.modelId);
      ctx.waitUntil(cacheStore.put(cacheRequest, response.clone()));
      return response;
    } catch (error) {
      const fallback = fallbackFor(error);
      return jsonResponse({ mode: "live", status: "text_fallback", fallback: true, message: fallback.message, reason: fallback.code });
    }
  }
  const audio = await new FakeVoiceProvider().replayPhrase(replayRequest);
  const audioBytes = new Uint8Array(audio.audio);
  const responseHeaders = headers(audio.contentType);
  responseHeaders.set("x-lingoflow-mode", "offline");
  responseHeaders.set("x-lingoflow-model", audio.modelId);
  return new Response(audioBytes.buffer as ArrayBuffer, { status: 200, headers: responseHeaders });
}

function assessmentFromEvent(event: EvidenceEvent, requestId: string): PronunciationAssessment {
  const context = event.context as Record<string, unknown>;
  const status = context.assessmentStatus === "complete" || context.assessmentStatus === "uncertain" || context.assessmentStatus === "failed" ? context.assessmentStatus : "failed";
  const score = status === "complete" && typeof context.score === "number" ? context.score : undefined;
  return {
    id: typeof context.assessmentId === "string" ? context.assessmentId : `practice-assessment:${event.learnerId}:${requestId}`,
    requestId,
    learnerId: event.learnerId,
    sessionId: event.sessionId,
    itemId: event.itemId,
    expected: event.expected ?? "",
    observed: event.observed ?? "",
    status,
    confidence: event.confidence,
    ...(score === undefined ? {} : { score }),
    ...(Array.isArray(context.feedback) ? { feedback: context.feedback.filter((value): value is string => typeof value === "string") } : {}),
    evaluatedAt: event.createdAt,
    language: typeof context.language === "string" ? context.language : "",
  };
}

async function assessPractice(request: Request, env: Env): Promise<Response> {
  const body = await bodyRecord(request);
  const repo = new D1Repository(env.DB);
  const learnerId = requiredString(body, "learnerId", 200);
  const sessionId = requiredString(body, "sessionId", 200);
  const itemId = requiredString(body, "itemId", 200);
  const observed = typeof (body.observed ?? body.observedText) === "string" ? String(body.observed ?? body.observedText).trim() : (() => { throw new WorkerInputError("observed must be a string"); })();
  if (observed.length > 2_000) throw new WorkerInputError("observed is too long");
  await repo.requireLearner(learnerId);
  const session = await repo.requireSession(sessionId);
  if (session.learnerId !== learnerId) throw new WorkerInputError("sessionId does not belong to learnerId");
  const phrase = (await repo.phrasesForLearner(learnerId)).find((candidate) => candidate.id === itemId);
  if (!phrase) throw new WorkerNotFoundError("Phrase", itemId);
  const requestId = optionalString(body, "requestId", 200) ?? optionalString(body, "id", 200) ?? crypto.randomUUID();
  const evidenceId = `practice-assessment:${learnerId}:${requestId}`;
  const existing = (await repo.evidenceForLearner(learnerId)).find((event) => event.id === evidenceId);
  if (existing) {
    const assessment = assessmentFromEvent(existing, requestId);
    return jsonResponse({ mode: PRACTICE_MODE, status: assessment.status, confidence: assessment.confidence, ...(assessment.score === undefined ? {} : { score: assessment.score }), ...(assessment.feedback ? { feedback: assessment.feedback } : {}), requestId, duplicate: true, assessment, evidence: { accepted: false, duplicate: true, event: existing } });
  }
  const normalizedExpected = phrase.targetText.trim().toLocaleLowerCase();
  const normalizedObserved = observed.toLocaleLowerCase();
  const status = !normalizedObserved ? "failed" : normalizedExpected === normalizedObserved ? "complete" : "uncertain";
  const confidence = status === "complete" ? 0.99 : status === "uncertain" ? 0.55 : 0;
  const feedback = !normalizedObserved ? ["No spoken attempt was received."] : status === "complete" ? ["Clear match."] : ["The offline assessor could not confirm an exact match. Try once more."];
  const assessment: PronunciationAssessment = {
    id: `fake-assessment:${requestId}`,
    requestId,
    learnerId,
    sessionId,
    itemId,
    expected: phrase.targetText,
    observed,
    status,
    confidence,
    ...(status === "complete" ? { score: 1 } : {}),
    feedback,
    evaluatedAt: now(),
    language: phrase.language,
  };
  const evidence: EvidenceEvent = {
    id: evidenceId,
    learnerId,
    sessionId,
    itemId,
    skillId: phrase.skillId,
    type: "pronunciation_assessed",
    expected: phrase.targetText,
    observed,
    outcome: status === "complete" ? "success" : status === "failed" ? "failure" : "uncertain",
    confidence,
    source: "assessment",
    context: { mode: PRACTICE_MODE, provider: "fake_assessment", assessmentId: assessment.id, assessmentStatus: status, language: phrase.language, ...(assessment.score === undefined ? {} : { score: assessment.score }), feedback },
    createdAt: assessment.evaluatedAt,
  };
  const append = await repo.appendEvidence(evidence);
  return jsonResponse({ mode: PRACTICE_MODE, status, confidence, ...(assessment.score === undefined ? {} : { score: assessment.score }), feedback, requestId, duplicate: append.duplicate, assessment, evidence: append }, append.duplicate ? 200 : 201);
}

async function appendTransfer(request: Request, env: Env): Promise<Response> {
  const body = await bodyRecord(request);
  const repo = new D1Repository(env.DB);
  const learnerId = requiredString(body, "learnerId", 200);
  const sessionId = requiredString(body, "sessionId", 200);
  await repo.requireLearner(learnerId);
  const session = await repo.requireSession(sessionId);
  if (session.learnerId !== learnerId) throw new WorkerInputError("sessionId does not belong to learnerId");
  const itemId = requiredString(body, "itemId", 200);
  const skillId = optionalString(body, "skillId", 200);
  const original = asRecord(body.original);
  const attempt = asRecord(body.attempt);
  const outcome = enumValue(body, "outcome", OUTCOMES);
  const assessment = evaluateTransfer({ original, attempt, outcome });
  const event: EvidenceEvent = {
    id: idOrRandom(body),
    learnerId,
    sessionId,
    itemId,
    ...(skillId ? { skillId } : {}),
    type: assessment.isTransfer && assessment.outcome === "success" ? "transfer_success" : assessment.isTransfer && assessment.outcome === "failure" ? "transfer_failure" : "attempted",
    outcome: assessment.outcome === "success" ? "success" : assessment.outcome === "failure" ? "failure" : "uncertain",
    confidence: numberValue(body, "confidence", assessment.outcome === "uncertain" ? 0.5 : 1),
    source: "transfer",
    context: { ...(optionalRecord(body.context) ?? {}), isTransfer: assessment.isTransfer, changedDimensions: [...assessment.changedDimensions] },
    createdAt: isoDateValue(body, "createdAt", now()),
  };
  const evidence = await repo.appendEvidence(event);
  return jsonResponse({ assessment, evidence }, evidence.duplicate ? 200 : 201);
}

async function handleApi(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | undefined> {
  const path = routePath(request);
  if (!path.startsWith("/api/")) return undefined;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: new Headers({ ...Object.fromEntries(headers()), allow: "GET, POST, OPTIONS" }) });
  if (request.method === "GET" && path === "/api/health") return jsonResponse({ status: "ok", mode: mode(env), persistence: "cloudflare-d1" });
  if (request.method === "POST" && path === "/api/voice/session-context") return voiceSessionContext(request, env);
  if (request.method === "POST" && path === "/api/voice/connect") return connectVoice(request, env);
  if (request.method === "POST" && path === "/api/voice/replay") return replayPhrase(request, env, ctx);
  if (request.method === "POST" && path === "/api/practice/assess") return assessPractice(request, env);
  if (request.method === "POST" && path === "/api/transfer-attempts") return appendTransfer(request, env);

  const repo = new D1Repository(env.DB);
  if (request.method === "POST" && path === "/api/learners") {
    const body = await bodyRecord(request);
    const id = idOrRandom(body);
    const objectives = body.objectives === undefined ? [] : !Array.isArray(body.objectives) ? (() => { throw new WorkerInputError("objectives must be an array"); })() : body.objectives.map((value) => parseObjective(value, id));
    const phrases = body.phrases === undefined ? [] : !Array.isArray(body.phrases) ? (() => { throw new WorkerInputError("phrases must be an array"); })() : body.phrases.map((value) => parsePhrase(value, id));
    const learner = await repo.createLearner({ id, nativeLanguage: requiredString(body, "nativeLanguage", 40), targetLanguage: requiredString(body, "targetLanguage", 40), level: optionalString(body, "level", 40) ?? "unknown", isAdult: requiredBoolean(body, "isAdult"), ...(optionalString(body, "timezone", 100) ? { timezone: optionalString(body, "timezone", 100) } : {}), ...(optionalString(body, "displayName", 200) ? { displayName: optionalString(body, "displayName", 200) } : {}), roastOptIn: booleanValue(body, "roastOptIn") }, objectives, phrases);
    return jsonResponse({ learner }, 201);
  }
  const objectiveMatch = path.match(/^\/api\/learners\/([^/]+)\/objectives$/);
  if (objectiveMatch && request.method === "POST") {
    const learnerId = decodeURIComponent(objectiveMatch[1] ?? "");
    await repo.requireLearner(learnerId);
    const body = await bodyRecord(request);
    const objective = await repo.createObjective(parseObjective(body.objective ?? body, learnerId));
    return jsonResponse({ objective }, 201);
  }
  const phraseMatch = path.match(/^\/api\/learners\/([^/]+)\/phrases$/);
  if (phraseMatch && request.method === "POST") {
    const learnerId = decodeURIComponent(phraseMatch[1] ?? "");
    await repo.requireLearner(learnerId);
    const body = await bodyRecord(request);
    const phrase = await repo.upsertPhrase(parsePhrase(body.phrase ?? body, learnerId));
    return jsonResponse({ phrase });
  }
  const summaryMatch = path.match(/^\/api\/learners\/([^/]+)\/summary$/);
  if (summaryMatch && request.method === "GET") return jsonResponse(await repo.getSummary(decodeURIComponent(summaryMatch[1] ?? "")));
  const reviewMatch = path.match(/^\/api\/learners\/([^/]+)\/review-queue$/);
  if (reviewMatch && request.method === "GET") return jsonResponse({ learnerId: decodeURIComponent(reviewMatch[1] ?? ""), items: await repo.getReviewQueue(decodeURIComponent(reviewMatch[1] ?? ""), now()) });
  const objectivesMatch = path.match(/^\/api\/learners\/([^/]+)\/objectives$/);
  if (objectivesMatch && request.method === "GET") {
    const learnerId = decodeURIComponent(objectivesMatch[1] ?? "");
    await repo.requireLearner(learnerId);
    return jsonResponse({ learnerId, objectives: await repo.listObjectives(learnerId) });
  }
  const phraseGetMatch = path.match(/^\/api\/phrases\/([^/]+)$/);
  if (phraseGetMatch && request.method === "GET") {
    const phraseId = decodeURIComponent(phraseGetMatch[1] ?? "");
    const phrase = await repo.getPhrase(phraseId);
    if (!phrase) throw new WorkerNotFoundError("Phrase", phraseId);
    return jsonResponse({ phrase });
  }
  if (request.method === "POST" && path === "/api/sessions") {
    const body = await bodyRecord(request);
    const learnerId = requiredString(body, "learnerId", 200);
    const learner = await repo.requireLearner(learnerId);
    const session = await repo.createSession({ id: idOrRandom(body), learnerId, targetLanguage: optionalString(body, "targetLanguage", 40) ?? learner.targetLanguage, nativeLanguage: optionalString(body, "nativeLanguage", 40) ?? learner.nativeLanguage, status: enumValue(body, "status", SESSION_STATUSES, "active"), startedAt: isoDateValue(body, "startedAt", now()), ...(optionalString(body, "endedAt", 80) ? { endedAt: isoDateValue(body, "endedAt") } : {}), ...(optionalString(body, "objectiveId", 200) ? { objectiveId: optionalString(body, "objectiveId", 200) } : {}) });
    return jsonResponse({ session }, 201);
  }
  if (request.method === "POST" && path === "/api/evidence") {
    const body = await bodyRecord(request);
    const source = body.event === undefined ? body : asRecord(body.event);
    const event: EvidenceEvent = { id: idOrRandom(source), learnerId: requiredString(source, "learnerId", 200), sessionId: requiredString(source, "sessionId", 200), itemId: requiredString(source, "itemId", 200), ...(optionalString(source, "skillId", 200) ? { skillId: optionalString(source, "skillId", 200) } : {}), type: enumValue(source, "type", EVIDENCE_TYPES), ...(optionalString(source, "expected", 2_000) ? { expected: optionalString(source, "expected", 2_000) } : {}), ...(optionalString(source, "observed", 2_000) ? { observed: optionalString(source, "observed", 2_000) } : {}), outcome: enumValue(source, "outcome", OUTCOMES), confidence: numberValue(source, "confidence"), source: enumValue(source, "source", SOURCES, "conversation"), context: (optionalRecord(source.context) ?? {}) as EvidenceEvent["context"], createdAt: isoDateValue(source, "createdAt", now()) };
    validateEvidenceEvent(event);
    const result = await repo.appendEvidence(event);
    return jsonResponse(result, result.duplicate ? 200 : 201);
  }
  return jsonResponse({ error: "NOT_FOUND", message: "API route not found" }, 404);
}

const handler: ExportedHandler<Env> = {
  async fetch(request, env, ctx) {
    const requestId = requestIdFor(request);
    try {
      const limited = await rateLimitResponse(request, env);
      if (limited) return withResponseHeaders(limited, requestId);
      const api = await handleApi(request, env, ctx);
      if (api) return withResponseHeaders(api, requestId);
      return withResponseHeaders(await env.ASSETS.fetch(request), requestId);
    } catch (error) {
      return withResponseHeaders(errorResponse(error), requestId);
    }
  },
};

export default handler;
