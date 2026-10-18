import { randomUUID } from "node:crypto";
import type {
  AssessmentResult,
  EvidenceEvent,
  PronunciationAssessment,
  PronunciationAssessmentRequest,
} from "../../../../packages/contracts/dist/index.js";
import type { AssessmentProvider } from "../../../../packages/providers/dist/index.js";
import { createAssessmentProvider } from "../voice/assessment.js";
import { InvalidInputError } from "../http/validation.js";
import {
  RepositoryNotFoundError,
  type AppendEvidenceResult,
  type SqliteRepository,
} from "../persistence/index.js";

/**
 * Offline phrase practice is transcript comparison, not microphone or phoneme
 * scoring. Keep this marker in every response and normalized evidence record so
 * clients do not present the result as a live pronunciation measurement.
 */
export const PRACTICE_ASSESSMENT_MODE = "offline_transcript" as const;

export type PracticeAssessmentMode = typeof PRACTICE_ASSESSMENT_MODE;

export interface PracticeAssessmentInput {
  readonly learnerId: string;
  readonly sessionId: string;
  readonly itemId: string;
  readonly observed: string;
  readonly requestId?: string;
}

export interface PracticeAssessmentResponse {
  readonly assessment: PronunciationAssessment;
  readonly evidence: AppendEvidenceResult;
  readonly mode: PracticeAssessmentMode;
  readonly duplicate: boolean;
}

export interface AssessmentServiceOptions {
  readonly repository: SqliteRepository;
  readonly provider?: AssessmentProvider;
  readonly now?: () => string;
}

const MAX_ID_LENGTH = 200;
const MAX_TEXT_LENGTH = 2_000;

function requiredInput(value: unknown, field: string, maxLength = MAX_ID_LENGTH): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidInputError(`${field} must be a non-empty string`);
  }
  if (value.length > maxLength) throw new InvalidInputError(`${field} is too long`);
  return value.trim();
}

function observedInput(value: unknown): string {
  if (typeof value !== "string") throw new InvalidInputError("observed must be a string");
  if (value.length > MAX_TEXT_LENGTH) throw new InvalidInputError("observed is too long");
  // An empty transcript is a valid failed attempt and is intentionally passed
  // to the provider so the response can remain an honest `failed` assessment.
  return value.trim();
}

function confidenceValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function feedbackValue(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const feedback = value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim().slice(0, MAX_TEXT_LENGTH));
  return feedback.length > 0 ? feedback : undefined;
}

function statusValue(value: unknown): "complete" | "uncertain" | "failed" {
  if (value === "complete" || value === "uncertain" || value === "failed") return value;
  // A synchronous practice endpoint cannot honestly expose a pending result.
  return "failed";
}

function outcomeFor(status: "complete" | "uncertain" | "failed"): EvidenceEvent["outcome"] {
  if (status === "complete") return "success";
  if (status === "failed") return "failure";
  return "uncertain";
}

function scoreValue(value: unknown, status: "complete" | "uncertain" | "failed"): number | undefined {
  // Scores are provider output only. In particular, never derive one from
  // confidence or transcript similarity for uncertain/failed outcomes.
  if (status !== "complete" || typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

function assessmentId(learnerId: string, requestId: string): string {
  return `practice-assessment:${learnerId}:${requestId}`;
}

function resultFromEvidence(event: EvidenceEvent, requestId: string): PronunciationAssessment {
  const context = event.context as Record<string, unknown>;
  const status = statusValue(context.assessmentStatus);
  const score = scoreValue(context.score, status);
  const feedback = feedbackValue(context.feedback);
  return {
    id: typeof context.assessmentId === "string" ? context.assessmentId : assessmentId(event.learnerId, requestId),
    requestId,
    learnerId: event.learnerId,
    sessionId: event.sessionId,
    itemId: event.itemId,
    expected: event.expected ?? "",
    observed: event.observed ?? "",
    status,
    confidence: confidenceValue(event.confidence),
    ...(score === undefined ? {} : { score }),
    ...(feedback === undefined ? {} : { feedback }),
    evaluatedAt: event.createdAt,
    language: typeof context.language === "string" ? context.language : "",
  };
}

function normalizedAssessment(
  request: PronunciationAssessmentRequest,
  result: AssessmentResult,
  now: string,
): PronunciationAssessment {
  const status = statusValue(result.status);
  const score = scoreValue(result.score, status);
  const feedback = feedbackValue(result.feedback);
  return {
    id: typeof result.id === "string" && result.id.trim().length > 0 ? result.id : `fake-assessment:${request.id}`,
    requestId: request.id,
    learnerId: request.learnerId,
    sessionId: request.sessionId,
    itemId: request.itemId,
    expected: request.expected,
    observed: request.observed,
    status,
    confidence: confidenceValue(result.confidence),
    ...(score === undefined ? {} : { score }),
    ...(feedback === undefined ? {} : { feedback }),
    evaluatedAt:
      typeof result.evaluatedAt === "string" && !Number.isNaN(Date.parse(result.evaluatedAt))
        ? new Date(result.evaluatedAt).toISOString()
        : now,
    language: request.language,
  };
}

/** Coordinates phrase lookup, offline assessment, and append-only evidence. */
export class AssessmentService {
  private readonly repository: SqliteRepository;
  private readonly provider: AssessmentProvider;
  private readonly now: () => string;

  public constructor(options: AssessmentServiceOptions) {
    this.repository = options.repository;
    this.provider = options.provider ?? createAssessmentProvider();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  public async assess(input: PracticeAssessmentInput): Promise<PracticeAssessmentResponse> {
    const learnerId = requiredInput(input.learnerId, "learnerId");
    const sessionId = requiredInput(input.sessionId, "sessionId");
    const itemId = requiredInput(input.itemId, "itemId");
    const observed = observedInput(input.observed);
    const requestId = input.requestId === undefined ? randomUUID() : requiredInput(input.requestId, "requestId");

    // Validate all ownership and references before consulting the provider.
    this.repository.requireLearner(learnerId);
    const session = this.repository.requireSession(sessionId);
    if (session.learnerId !== learnerId) throw new InvalidInputError("sessionId does not belong to learnerId");
    const phrase = this.repository.getPhrase(itemId);
    if (!phrase) throw new RepositoryNotFoundError("Phrase", itemId);
    const ownedPhrase = this.repository.phrasesForLearner(learnerId).find((candidate) => candidate.id === itemId);
    if (!ownedPhrase) throw new InvalidInputError("itemId does not belong to learnerId");

    const evidenceId = assessmentId(learnerId, requestId);
    const previous = this.repository.evidenceForLearner(learnerId).find((event) => event.id === evidenceId);
    if (previous) {
      const assessment = resultFromEvidence(previous, requestId);
      return {
        assessment,
        evidence: { accepted: false, duplicate: true, event: previous },
        mode: PRACTICE_ASSESSMENT_MODE,
        duplicate: true,
      };
    }

    const request: PronunciationAssessmentRequest = {
      id: requestId,
      learnerId,
      sessionId,
      itemId,
      expected: ownedPhrase.targetText,
      observed,
      language: ownedPhrase.language,
      capability: "pronunciation_assessment",
    };

    let assessment: PronunciationAssessment;
    try {
      const providerResult = await this.provider.assess(request);
      assessment = normalizedAssessment(request, providerResult, this.now());
    } catch {
      assessment = {
        id: `failed-assessment:${requestId}`,
        requestId,
        learnerId,
        sessionId,
        itemId,
        expected: ownedPhrase.targetText,
        observed,
        status: "failed",
        confidence: 0,
        feedback: ["The offline assessor could not complete this attempt."],
        evaluatedAt: this.now(),
        language: ownedPhrase.language,
      };
    }

    const context: EvidenceEvent["context"] = {
      mode: PRACTICE_ASSESSMENT_MODE,
      provider: "fake_assessment",
      assessmentId: assessment.id,
      assessmentStatus: assessment.status,
      language: assessment.language,
      ...(assessment.score === undefined ? {} : { score: assessment.score }),
      ...(assessment.feedback === undefined ? {} : { feedback: [...assessment.feedback] }),
    };
    const evidence: EvidenceEvent = {
      id: evidenceId,
      learnerId,
      sessionId,
      itemId,
      skillId: ownedPhrase.skillId,
      type: "pronunciation_assessed",
      expected: ownedPhrase.targetText,
      observed,
      outcome: outcomeFor(statusValue(assessment.status)),
      confidence: assessment.confidence,
      source: "assessment",
      context,
      createdAt: assessment.evaluatedAt,
    };
    const append = this.repository.appendEvidence(evidence);
    if (append.duplicate) {
      return {
        assessment: resultFromEvidence(append.event, requestId),
        evidence: append,
        mode: PRACTICE_ASSESSMENT_MODE,
        duplicate: true,
      };
    }
    return { assessment, evidence: append, mode: PRACTICE_ASSESSMENT_MODE, duplicate: false };
  }
}
