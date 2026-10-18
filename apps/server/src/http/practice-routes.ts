import type { FastifyInstance, FastifyReply } from "fastify";
import { AssessmentService, PRACTICE_ASSESSMENT_MODE, type AssessmentServiceOptions } from "../assessment/index.js";
import { RepositoryConflictError, RepositoryNotFoundError, type SqliteRepository } from "../persistence/index.js";
import { InvalidInputError, asRecord, bodyJson } from "./validation.js";

export interface PracticeRouteOptions extends Omit<AssessmentServiceOptions, "repository"> {
  readonly repository: SqliteRepository;
  readonly service?: AssessmentService;
}

function sendPracticeError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof InvalidInputError) return reply.code(400).send({ error: error.code, message: error.message });
  if (error instanceof RepositoryNotFoundError) return reply.code(404).send({ error: error.code, message: error.message });
  if (error instanceof RepositoryConflictError) return reply.code(409).send({ error: error.code, message: error.message });
  return reply.code(500).send({ error: "INTERNAL_ERROR", message: "The practice assessment could not be completed" });
}

function stringField(record: Record<string, unknown>, key: string, maxLength = 200): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) throw new InvalidInputError(`${key} must be a non-empty string`);
  if (value.length > maxLength) throw new InvalidInputError(`${key} is too long`);
  return value.trim();
}

function observedField(record: Record<string, unknown>): string {
  const value = record.observed ?? record.observedText;
  if (typeof value !== "string") throw new InvalidInputError("observed must be a string");
  if (value.length > 2_000) throw new InvalidInputError("observed is too long");
  return value.trim();
}

function optionalRequestId(record: Record<string, unknown>): string | undefined {
  const value = record.requestId ?? record.id;
  if (value === undefined || value === null || value === "") return undefined;
  return stringField({ requestId: value }, "requestId");
}

/** Register phrase practice assessment endpoints without coupling them to the general route module. */
export function registerPracticeRoutes(app: FastifyInstance, options: PracticeRouteOptions): AssessmentService {
  const service = options.service ?? new AssessmentService(options);
  app.post("/api/practice/assess", async (request, reply) => {
    try {
      const body = asRecord(bodyJson(request.body));
      const payload = body.request === undefined ? body : asRecord(body.request);
      const requestId = optionalRequestId(payload);
      const result = await service.assess({
        learnerId: stringField(payload, "learnerId"),
        sessionId: stringField(payload, "sessionId"),
        itemId: stringField(payload, "itemId"),
        observed: observedField(payload),
        ...(requestId === undefined ? {} : { requestId }),
      });
      const response = {
        mode: PRACTICE_ASSESSMENT_MODE,
        status: result.assessment.status,
        confidence: result.assessment.confidence,
        ...(result.assessment.score === undefined ? {} : { score: result.assessment.score }),
        ...(result.assessment.feedback === undefined ? {} : { feedback: result.assessment.feedback }),
        requestId: result.assessment.requestId,
        duplicate: result.duplicate,
        assessment: result.assessment,
        evidence: result.evidence,
      };
      return reply.code(result.duplicate ? 200 : 201).send(response);
    } catch (error) {
      return sendPracticeError(reply, error);
    }
  });
  return service;
}
