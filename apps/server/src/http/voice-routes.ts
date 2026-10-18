import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  InvalidInputError,
  asRecord,
  bodyJson,
  booleanValue,
  enumValue,
  numberValue,
  optionalString,
  requiredString,
} from "./validation.js";
import { RepositoryConflictError, RepositoryNotFoundError, type SqliteRepository } from "../persistence/index.js";
import {
  createVoiceSessionService,
  type VoiceConnectRequest,
  type VoiceReplayRequest,
  type VoiceSessionService,
} from "../voice/session-service.js";

export interface VoiceRouteOptions {
  readonly repository: SqliteRepository;
  readonly environment?: NodeJS.ProcessEnv;
  readonly now?: () => string;
  readonly fetchImpl?: typeof fetch;
  readonly service?: VoiceSessionService;
}

function sendVoiceError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof InvalidInputError) return reply.code(400).send({ error: error.code, message: error.message });
  if (error instanceof RepositoryNotFoundError) return reply.code(404).send({ error: error.code, message: error.message });
  if (error instanceof RepositoryConflictError) return reply.code(409).send({ error: error.code, message: error.message });
  return reply.code(500).send({ error: "INTERNAL_ERROR", message: "The voice request could not be completed" });
}

function requestBody(request: FastifyRequest): Record<string, unknown> {
  return asRecord(bodyJson(request.body));
}

function nestedOrRoot(body: Record<string, unknown>): Record<string, unknown> {
  return body.request === undefined ? body : asRecord(body.request);
}

function connectInput(body: Record<string, unknown>): VoiceConnectRequest {
  const request = nestedOrRoot(body);
  const merged = { ...body, ...request };
  const roastMode = enumValue(merged, "roastMode", ["off", "friendly"] as const, "off");
  return {
    sessionId: requiredString(merged, "sessionId", 200),
    learnerId: requiredString(merged, "learnerId", 200),
    ...(optionalString(merged, "objectiveId", 200) ? { objectiveId: optionalString(merged, "objectiveId", 200) } : {}),
    ...(optionalString(merged, "itemId", 200) ? { itemId: optionalString(merged, "itemId", 200) } : {}),
    ...(optionalString(merged, "tutorPersonality", 80) ? { tutorPersonality: optionalString(merged, "tutorPersonality", 80) } : {}),
    roastMode,
    ...(merged.connect === undefined ? {} : { connect: booleanValue(merged, "connect") }),
  };
}

function replayInput(body: Record<string, unknown>): VoiceReplayRequest {
  const request = nestedOrRoot(body);
  const merged = { ...body, ...request };
  const speed = merged.speed === undefined ? undefined : numberValue(merged, "speed");
  if (speed !== undefined && (speed <= 0 || speed > 2)) throw new InvalidInputError("speed must be greater than 0 and no greater than 2");
  return {
    phraseId: requiredString(merged, "phraseId", 200),
    text: requiredString(merged, "text", 2_000),
    language: requiredString(merged, "language", 40),
    contentVersion: optionalString(merged, "contentVersion", 100) ?? "1",
    ...(optionalString(merged, "voiceId", 200) ? { voiceId: optionalString(merged, "voiceId", 200) } : {}),
    ...(speed === undefined ? {} : { speed }),
  };
}

/** Register the standalone live/offline voice API routes. */
export function registerVoiceRoutes(app: FastifyInstance, options: VoiceRouteOptions): VoiceSessionService {
  const service = options.service ?? createVoiceSessionService({
    repository: options.repository,
    environment: options.environment,
    now: options.now,
    fetchImpl: options.fetchImpl,
  });

  app.post("/api/voice/connect", async (request, reply) => {
    try {
      const result = await service.connect(connectInput(requestBody(request)));
      return reply.send(result);
    } catch (error) {
      return sendVoiceError(reply, error);
    }
  });

  app.post("/api/voice/replay", async (request, reply) => {
    try {
      const result = await service.replayPhrase(replayInput(requestBody(request)));
      if (result.fallback) {
        return reply.code(200).type("application/json").send({
          mode: "live",
          status: "text_fallback",
          fallback: true,
          message: result.fallback.message,
          reason: result.fallback.code,
        });
      }
      const audio = result.audio;
      if (!audio) return reply.code(500).send({ error: "INTERNAL_ERROR", message: "The voice provider returned no audio" });
      return reply
        .header("cache-control", "private, max-age=3600")
        .header("x-lingoflow-mode", result.mode)
        .header("x-lingoflow-model", audio.modelId)
        .type(audio.contentType)
        .send(Buffer.from(audio.audio));
    } catch (error) {
      return sendVoiceError(reply, error);
    }
  });

  return service;
}
