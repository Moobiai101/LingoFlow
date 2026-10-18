import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { EvidenceEvent, LearningObjective } from "../../../../packages/contracts/dist/index.js";
import { domain } from "../domain-runtime.js";
import { providers } from "../voice/provider-runtime.js";
import { IdempotencyStore, validateToolRequest, validateWebhookRequest, verifyWebhookSignature } from "../webhooks/index.js";
import {
  CreatePhraseInput,
  RepositoryConflictError,
  RepositoryNotFoundError,
  SqliteRepository,
} from "../persistence/index.js";
import {
  InvalidInputError,
  asRecord,
  bodyJson,
  booleanValue,
  enumValue,
  isoDateValue,
  numberValue,
  optionalRecord,
  optionalString,
  requestHeader,
  requiredString,
  stringArray,
  type JsonRecord,
} from "./validation.js";

export interface ApiRouteOptions {
  readonly repository: SqliteRepository;
  readonly environment?: NodeJS.ProcessEnv;
  readonly now?: () => string;
}

const EVIDENCE_TYPES = ["understood", "attempted", "corrected", "recalled", "pronunciation_assessed", "hint_required", "retry_success", "transfer_success", "transfer_failure"] as const;
const OUTCOMES = ["success", "failure", "uncertain", "correct", "incorrect"] as const;
const SOURCES = ["conversation", "assessment", "review", "transfer", "system", "import"] as const;
const SESSION_STATUSES = ["active", "completed", "cancelled"] as const;
const OBJECTIVE_STATUSES = ["active", "completed", "paused"] as const;

function nowValue(options: ApiRouteOptions): string {
  return options.now?.() ?? new Date().toISOString();
}

function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof InvalidInputError) return reply.code(400).send({ error: error.code, message: error.message });
  if (error instanceof RepositoryNotFoundError) return reply.code(404).send({ error: error.code, message: error.message });
  if (error instanceof RepositoryConflictError) return reply.code(409).send({ error: error.code, message: error.message });
  if (error instanceof Error && (/^Evidence /.test(error.message) || /^Unsupported evidence type/.test(error.message))) return reply.code(400).send({ error: "INVALID_INPUT", message: error.message });
  return reply.code(500).send({ error: "INTERNAL_ERROR", message: "The request could not be completed" });
}

function params(request: FastifyRequest): { id: string } {
  const value = request.params as { id?: unknown };
  if (typeof value.id !== "string" || value.id.trim().length === 0) throw new InvalidInputError("id must be a non-empty string");
  return { id: value.id.trim() };
}

function optionalId(record: JsonRecord, key: string): string {
  return optionalString(record, key, 200) ?? randomUUID();
}

function parseObjective(value: unknown, learnerId: string): { objective: LearningObjective; input: Parameters<SqliteRepository["createObjective"]>[0] } {
  const record = asRecord(value);
  const id = optionalId(record, "id");
  const objective = {
    id,
    learnerId,
    title: requiredString(record, "title", 240),
    ...(optionalString(record, "description", 2_000) ? { description: optionalString(record, "description", 2_000) } : {}),
    skillIds: stringArray(record, "skillIds"),
    status: enumValue(record, "status", OBJECTIVE_STATUSES, "active"),
    ...(optionalString(record, "targetDate", 80) ? { targetDate: isoDateValue(record, "targetDate") } : {}),
  } satisfies Parameters<SqliteRepository["createObjective"]>[0];
  return { objective: objective as LearningObjective, input: objective };
}

function parsePhrase(value: unknown, learnerId: string): CreatePhraseInput {
  const record = asRecord(value);
  return {
    id: optionalId(record, "id"),
    learnerId,
    skillId: requiredString(record, "skillId", 200),
    ...(optionalString(record, "objectiveId", 200) ? { objectiveId: optionalString(record, "objectiveId", 200) } : {}),
    targetText: requiredString(record, "targetText", 2_000),
    ...(optionalString(record, "translation", 2_000) ? { translation: optionalString(record, "translation", 2_000) } : {}),
    language: requiredString(record, "language", 40),
    ...(optionalString(record, "context", 2_000) ? { context: optionalString(record, "context", 2_000) } : {}),
    ...(record.difficulty !== undefined ? { difficulty: numberValue(record, "difficulty") } : {}),
    ...(optionalString(record, "contentVersion", 100) ? { contentVersion: optionalString(record, "contentVersion", 100) } : {}),
  };
}

function phraseFromEvidence(body: JsonRecord, learnerId: string): CreatePhraseInput | undefined {
  const phraseValue = body.phrase;
  if (phraseValue === undefined) return undefined;
  return parsePhrase(phraseValue, learnerId);
}

function headerMap(request: FastifyRequest): Readonly<Record<string, string | undefined>> {
  const output: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(request.headers)) output[key] = requestHeader(value);
  return output;
}

export function registerApiRoutes(app: FastifyInstance, options: ApiRouteOptions): void {
  const { repository } = options;
  const webhookIdempotency = new IdempotencyStore();
  const toolIdempotency = new IdempotencyStore();

  app.get("/api/health", async () => ({ status: "ok", mode: options.environment?.LINGOFLOW_MODE ?? process.env.LINGOFLOW_MODE ?? "offline" }));

  app.post("/api/learners", async (request, reply) => {
    try {
      const body = asRecord(bodyJson(request.body));
      const id = optionalId(body, "id");
      if (body.objectives !== undefined && !Array.isArray(body.objectives)) throw new InvalidInputError("objectives must be an array");
      if (body.phrases !== undefined && !Array.isArray(body.phrases)) throw new InvalidInputError("phrases must be an array");
      const learner = repository.createLearner({
        id,
        nativeLanguage: requiredString(body, "nativeLanguage", 40),
        targetLanguage: requiredString(body, "targetLanguage", 40),
        level: optionalString(body, "level", 40) ?? "unknown",
        isAdult: booleanValue(body, "isAdult"),
        ...(optionalString(body, "timezone", 100) ? { timezone: optionalString(body, "timezone", 100) } : {}),
        ...(optionalString(body, "displayName", 200) ? { displayName: optionalString(body, "displayName", 200) } : {}),
        roastOptIn: booleanValue(body, "roastOptIn"),
      },
      Array.isArray(body.objectives) ? body.objectives.map((value) => parseObjective(value, id).input) : [],
      Array.isArray(body.phrases) ? body.phrases.map((value) => parsePhrase(value, id)) : [],
      );
      return reply.code(201).send({ learner });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/learners/:id/summary", async (request, reply) => {
    try {
      const { id } = params(request);
      return reply.send(repository.getSummary(id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/learners/:id/review-queue", async (request, reply) => {
    try {
      const { id } = params(request);
      return reply.send({ learnerId: id, items: repository.getReviewQueue(id, nowValue(options)) });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/learners/:id/objectives", async (request, reply) => {
    try {
      const { id } = params(request);
      repository.requireLearner(id);
      return reply.send({ learnerId: id, objectives: repository.listObjectives(id) });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/learners/:id/objectives", async (request, reply) => {
    try {
      const { id: learnerId } = params(request);
      repository.requireLearner(learnerId);
      const body = asRecord(bodyJson(request.body));
      const objectiveBody = body.objective === undefined ? body : asRecord(body.objective);
      const parsed = parseObjective(objectiveBody, learnerId);
      const objective = repository.createObjective(parsed.input);
      return reply.code(201).send({ objective });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/learners/:id/phrases", async (request, reply) => {
    try {
      const { id: learnerId } = params(request);
      repository.requireLearner(learnerId);
      const body = asRecord(bodyJson(request.body));
      const phraseBody = body.phrase === undefined ? body : asRecord(body.phrase);
      const phrase = repository.upsertPhrase(parsePhrase(phraseBody, learnerId));
      return reply.code(200).send({ phrase });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/sessions", async (request, reply) => {
    try {
      const body = asRecord(bodyJson(request.body));
      const learnerId = requiredString(body, "learnerId", 200);
      const learner = repository.requireLearner(learnerId);
      const session = repository.createSession({
        id: optionalId(body, "id"),
        learnerId,
        targetLanguage: optionalString(body, "targetLanguage", 40) ?? learner.targetLanguage,
        nativeLanguage: optionalString(body, "nativeLanguage", 40) ?? learner.nativeLanguage,
        status: enumValue(body, "status", SESSION_STATUSES, "active"),
        startedAt: isoDateValue(body, "startedAt", nowValue(options)),
        ...(optionalString(body, "endedAt", 80) ? { endedAt: isoDateValue(body, "endedAt") } : {}),
        ...(optionalString(body, "objectiveId", 200) ? { objectiveId: optionalString(body, "objectiveId", 200) } : {}),
      });
      return reply.code(201).send({ session });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/evidence", async (request, reply) => {
    try {
      const body = asRecord(bodyJson(request.body));
      const eventBody = body.event === undefined ? body : asRecord(body.event);
      const learnerId = requiredString(eventBody, "learnerId", 200);
      const sessionId = requiredString(eventBody, "sessionId", 200);
      const event: EvidenceEvent = {
        id: optionalId(eventBody, "id"),
        learnerId,
        sessionId,
        itemId: requiredString(eventBody, "itemId", 200),
        ...(optionalString(eventBody, "skillId", 200) ? { skillId: optionalString(eventBody, "skillId", 200) } : {}),
        type: enumValue(eventBody, "type", EVIDENCE_TYPES),
        ...(optionalString(eventBody, "expected", 2_000) ? { expected: optionalString(eventBody, "expected", 2_000) } : {}),
        ...(optionalString(eventBody, "observed", 2_000) ? { observed: optionalString(eventBody, "observed", 2_000) } : {}),
        outcome: enumValue(eventBody, "outcome", OUTCOMES),
        confidence: numberValue(eventBody, "confidence"),
        source: enumValue(eventBody, "source", SOURCES, "conversation"),
        context: (optionalRecord(eventBody.context) ?? {}) as EvidenceEvent["context"],
        createdAt: isoDateValue(eventBody, "createdAt", nowValue(options)),
      };
      domain.validateEvidenceEvent(event);
      const phrase = phraseFromEvidence(body, learnerId);
      if (phrase) repository.upsertPhrase(phrase);
      const result = repository.appendEvidence(event);
      return reply.code(result.duplicate ? 200 : 201).send(result);
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/transfer-attempts", async (request, reply) => {
    try {
      const body = asRecord(bodyJson(request.body));
      const learnerId = requiredString(body, "learnerId", 200);
      const sessionId = requiredString(body, "sessionId", 200);
      const itemId = requiredString(body, "itemId", 200);
      const original = asRecord(body.original);
      const attempt = asRecord(body.attempt);
      const outcome = enumValue(body, "outcome", OUTCOMES);
      const assessment = domain.evaluateTransfer({ original, attempt, outcome });
      const event: EvidenceEvent = {
        id: optionalId(body, "id"),
        learnerId,
        sessionId,
        itemId,
        ...(optionalString(body, "skillId", 200) ? { skillId: optionalString(body, "skillId", 200) } : {}),
        type: assessment.isTransfer && assessment.outcome === "success" ? "transfer_success" : assessment.isTransfer && assessment.outcome === "failure" ? "transfer_failure" : "attempted",
        outcome: assessment.outcome === "success" ? "success" : assessment.outcome === "failure" ? "failure" : "uncertain",
        confidence: numberValue(body, "confidence", assessment.outcome === "uncertain" ? 0.5 : 1),
        source: "transfer",
        context: { ...(optionalRecord(body.context) ?? {}), isTransfer: assessment.isTransfer, changedDimensions: [...assessment.changedDimensions] } as EvidenceEvent["context"],
        createdAt: isoDateValue(body, "createdAt", nowValue(options)),
      };
      const result = repository.appendEvidence(event);
      return reply.code(result.duplicate ? 200 : 201).send({ assessment, evidence: result });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get("/api/phrases/:id", async (request, reply) => {
    try {
      const { id } = params(request);
      const phrase = repository.getPhrase(id);
      if (!phrase) throw new RepositoryNotFoundError("Phrase", id);
      return reply.send({ phrase });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/voice/session-context", async (request, reply) => {
    try {
      const body = asRecord(bodyJson(request.body));
      const requestBody = body.request === undefined ? body : asRecord(body.request);
      const learnerId = requiredString(requestBody, "learnerId", 200);
      const sessionId = requiredString(requestBody, "sessionId", 200);
      const learner = repository.requireLearner(learnerId);
      const session = repository.requireSession(sessionId);
      if (session.learnerId !== learner.id) throw new InvalidInputError("sessionId does not belong to learnerId");
      const objectiveId = optionalString(requestBody, "objectiveId", 200) ?? session.objectiveId;
      const itemId = optionalString(requestBody, "itemId", 200);
      const objective = objectiveId ? repository.getObjective(objectiveId) : undefined;
      const activeItem = itemId ? repository.getPhrase(itemId) : undefined;
      const queue = repository.getReviewQueue(learnerId, nowValue(options));
      const reviewItem = queue.find((item) => item.itemId === itemId) ?? queue[0];
      const summary = repository.getSummary(learnerId);
      const topErrorPatterns = summary.skills.filter((skill) => skill.errorCount > 0).sort((left, right) => right.priorityScore - left.priorityScore || left.skillId.localeCompare(right.skillId)).slice(0, 2).map((skill) => skill.skillId);
      const contextInput = {
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
        roastMode: enumValue(body, "roastMode", ["off", "friendly"] as const, "off"),
      };
      const mode = options.environment?.LINGOFLOW_MODE ?? process.env.LINGOFLOW_MODE ?? "offline";
      const provider = mode === "live"
        ? new providers.ElevenLabsAgentProvider({ mode: "live", apiKey: options.environment?.ELEVENLABS_API_KEY ?? process.env.ELEVENLABS_API_KEY, agentId: options.environment?.ELEVENLABS_AGENT_ID ?? process.env.ELEVENLABS_AGENT_ID, voiceId: options.environment?.ELEVENLABS_VOICE_ID ?? process.env.ELEVENLABS_VOICE_ID })
        : new providers.FakeVoiceProvider();
      return reply.send({ mode: provider.mode, context: provider.createSessionContext(contextInput) });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/tools/:toolName", async (request, reply) => {
    try {
      const rawBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});
      const environment = options.environment ?? process.env;
      const toolSecret = environment.LINGOFLOW_TOOL_SECRET;
      const toolSignature = requestHeader(request.headers["x-lingoflow-tool-signature"]);
      if (!toolSecret?.trim() || !verifyWebhookSignature(rawBody, toolSignature, toolSecret)) return reply.code(401).send({ error: "unauthorized_tool_request" });
      const body = asRecord(bodyJson(rawBody));
      const routeParams = request.params as { toolName?: unknown };
      if (typeof routeParams.toolName !== "string" || routeParams.toolName.trim().length === 0) throw new InvalidInputError("toolName must be a non-empty string");
      const validation = validateToolRequest({ ...body, toolName: routeParams.toolName }, { idempotency: toolIdempotency });
      if (!validation.ok) return reply.code(validation.statusCode).send({ error: validation.reason });
      if (validation.duplicate) return reply.send({ accepted: true, duplicate: true, requestId: validation.request.requestId });
      const toolArgs = validation.request.args ?? {};
      if (validation.request.toolName === "get_current_objective") {
        repository.requireLearner(validation.request.learnerId);
        return reply.send({ accepted: true, duplicate: false, objective: repository.listObjectives(validation.request.learnerId).find((objective) => objective.status === "active") });
      }
      if (validation.request.toolName === "get_phrase_details") {
        const phraseId = requiredString(toolArgs, "phraseId", 200);
        const phrase = repository.getPhrase(phraseId);
        if (!phrase) throw new RepositoryNotFoundError("Phrase", phraseId);
        return reply.send({ accepted: true, duplicate: false, phrase });
      }
      if (validation.request.toolName === "record_learning_evidence") {
        const evidenceBody: JsonRecord = { ...toolArgs, learnerId: validation.request.learnerId, sessionId: validation.request.sessionId };
        const learnerId = validation.request.learnerId;
        const event: EvidenceEvent = {
          id: optionalId(evidenceBody, "id"),
          learnerId,
          sessionId: validation.request.sessionId,
          itemId: requiredString(evidenceBody, "itemId", 200),
          ...(optionalString(evidenceBody, "skillId", 200) ? { skillId: optionalString(evidenceBody, "skillId", 200) } : {}),
          type: enumValue(evidenceBody, "type", EVIDENCE_TYPES),
          ...(optionalString(evidenceBody, "expected", 2_000) ? { expected: optionalString(evidenceBody, "expected", 2_000) } : {}),
          ...(optionalString(evidenceBody, "observed", 2_000) ? { observed: optionalString(evidenceBody, "observed", 2_000) } : {}),
          outcome: enumValue(evidenceBody, "outcome", OUTCOMES),
          confidence: numberValue(evidenceBody, "confidence"),
          source: enumValue(evidenceBody, "source", SOURCES, "conversation"),
          context: (optionalRecord(evidenceBody.context) ?? {}) as EvidenceEvent["context"],
          createdAt: isoDateValue(evidenceBody, "createdAt", nowValue(options)),
        };
        return reply.send({ accepted: true, duplicate: false, evidence: repository.appendEvidence(event) });
      }
      if (validation.request.toolName === "request_phrase_practice") {
        const phraseId = requiredString(toolArgs, "phraseId", 200);
        const phrase = repository.getPhrase(phraseId);
        if (!phrase) throw new RepositoryNotFoundError("Phrase", phraseId);
        return reply.send({ accepted: true, duplicate: false, phrase, requested: true });
      }
      if (validation.request.toolName === "mark_transfer_result") {
        return reply.send({ accepted: true, duplicate: false, assessment: domain.evaluateTransfer({ original: asRecord(toolArgs.original), attempt: asRecord(toolArgs.attempt), outcome: enumValue(toolArgs, "outcome", OUTCOMES) }) });
      }
      return reply.code(403).send({ error: "unknown_tool" });
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post("/api/webhooks/elevenlabs", async (request, reply) => {
    const rawBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});
    const environment = options.environment ?? process.env;
    const validation = validateWebhookRequest({ rawBody, headers: headerMap(request) }, {
      secret: environment.ELEVENLABS_WEBHOOK_SECRET,
      now: () => Date.now(),
      idempotency: webhookIdempotency,
    });
    if (!validation.ok) return reply.code(validation.statusCode).send({ error: validation.reason });
    if (validation.duplicate) return reply.send({ accepted: true, duplicate: true, requestId: validation.requestId });
    try {
      const normalized = providers.normalizeElevenLabsEvent(bodyJson(rawBody));
      if (!normalized) throw new InvalidInputError("Unsupported or invalid ElevenLabs event payload");
      const stored = repository.appendVoiceEvent(normalized);
      return reply.send({ accepted: stored.accepted, duplicate: stored.duplicate, requestId: validation.requestId, event: normalized });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
