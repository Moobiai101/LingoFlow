import type {
  EvidenceEvent,
  EvidenceOutcome,
  EvidenceType,
  LearningItem,
  PersistenceState,
  ReviewPriority,
  SkillId,
  SkillState,
} from "../../contracts/src/index.js";

export const HIGH_CONFIDENCE_THRESHOLD = 0.8;

export interface AppendEvidenceResult {
  readonly accepted: boolean;
  readonly duplicate: boolean;
  readonly event: EvidenceEvent;
}

export interface EvidenceLedgerOptions {
  readonly initialEvents?: readonly EvidenceEvent[];
}

function assertNonEmpty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Evidence ${field} must be a non-empty string`);
  }
}

export function normalizeOutcome(outcome: EvidenceOutcome): "success" | "failure" | "uncertain" {
  if (outcome === "success" || outcome === "correct") return "success";
  if (outcome === "failure" || outcome === "incorrect") return "failure";
  return "uncertain";
}

export function isEvidenceType(value: unknown): value is EvidenceType {
  return (
    value === "understood" ||
    value === "attempted" ||
    value === "corrected" ||
    value === "recalled" ||
    value === "pronunciation_assessed" ||
    value === "hint_required" ||
    value === "retry_success" ||
    value === "transfer_success" ||
    value === "transfer_failure"
  );
}

export function validateEvidenceEvent(event: EvidenceEvent): void {
  assertNonEmpty(event.id, "id");
  assertNonEmpty(event.learnerId, "learnerId");
  assertNonEmpty(event.sessionId, "sessionId");
  assertNonEmpty(event.itemId, "itemId");
  assertNonEmpty(event.createdAt, "createdAt");
  if (!isEvidenceType(event.type)) throw new Error(`Unsupported evidence type: ${String(event.type)}`);
  if (!Number.isFinite(event.confidence) || event.confidence < 0 || event.confidence > 1) {
    throw new Error("Evidence confidence must be between 0 and 1");
  }
  if (typeof event.context !== "object" || event.context === null || Array.isArray(event.context)) {
    throw new Error("Evidence context must be an object");
  }
}

/**
 * An append-only, in-memory ledger. Event ids are the idempotency key: replaying
 * a delivery returns the original event and does not change a projection.
 */
export class EvidenceLedger {
  private readonly eventsById = new Map<string, EvidenceEvent>();

  public constructor(options: EvidenceLedgerOptions = {}) {
    for (const event of options.initialEvents ?? []) this.append(event);
  }

  public append(event: EvidenceEvent): AppendEvidenceResult {
    const existing = this.eventsById.get(event.id);
    if (existing) return { accepted: false, duplicate: true, event: existing };
    validateEvidenceEvent(event);

    const stored: EvidenceEvent = {
      ...event,
      context: { ...event.context },
    };
    this.eventsById.set(stored.id, stored);
    return { accepted: true, duplicate: false, event: stored };
  }

  public has(eventId: string): boolean {
    return this.eventsById.has(eventId);
  }

  public get(eventId: string): EvidenceEvent | undefined {
    return this.eventsById.get(eventId);
  }

  public all(): readonly EvidenceEvent[] {
    return [...this.eventsById.values()].sort(compareEvidence);
  }

  public forLearner(learnerId: string): readonly EvidenceEvent[] {
    return this.all().filter((event) => event.learnerId === learnerId);
  }

  public forSkill(skillId: SkillId, items?: ReadonlyMap<string, LearningItem>): readonly EvidenceEvent[] {
    return this.all().filter((event) => resolveSkillId(event, items) === skillId);
  }

  public size(): number {
    return this.eventsById.size;
  }
}

export function appendEvidence(ledger: EvidenceLedger, event: EvidenceEvent): AppendEvidenceResult {
  return ledger.append(event);
}

function compareEvidence(left: EvidenceEvent, right: EvidenceEvent): number {
  const byTime = left.createdAt.localeCompare(right.createdAt);
  return byTime === 0 ? left.id.localeCompare(right.id) : byTime;
}

function resolveSkillId(event: EvidenceEvent, items?: ReadonlyMap<string, LearningItem>): string {
  return event.skillId ?? items?.get(event.itemId)?.skillId ?? event.itemId;
}

function isAttemptEvidence(event: EvidenceEvent): boolean {
  return event.type !== "understood" && event.type !== "corrected";
}

function isSuccessfulTransfer(event: EvidenceEvent): boolean {
  return event.type === "transfer_success" && normalizeOutcome(event.outcome) === "success";
}

function isFailedTransfer(event: EvidenceEvent): boolean {
  return event.type === "transfer_failure" && normalizeOutcome(event.outcome) === "failure";
}

export interface PersistenceAssessment {
  readonly persistence: PersistenceState;
  readonly highConfidenceErrors: number;
  readonly distinctErrorTurns: number;
  readonly distinctErrorSessions: number;
}

export function assessPersistence(events: readonly EvidenceEvent[]): PersistenceAssessment {
  const errors = events.filter(
    (event) => isAttemptEvidence(event) && normalizeOutcome(event.outcome) === "failure",
  );
  const highConfidenceErrors = errors.filter(
    (event) => event.confidence >= HIGH_CONFIDENCE_THRESHOLD,
  );
  const distinctErrorTurns = new Set(
    highConfidenceErrors.map((event) => event.context.turnId ?? event.id),
  ).size;
  const distinctErrorSessions = new Set(highConfidenceErrors.map((event) => event.sessionId)).size;

  let persistence: PersistenceState = "none";
  if (errors.length > 0) persistence = "temporary";
  if (highConfidenceErrors.length >= 2 && distinctErrorTurns >= 2) persistence = "suspected";
  if (highConfidenceErrors.length >= 3 && distinctErrorSessions >= 3) persistence = "persistent";

  return {
    persistence,
    highConfidenceErrors: highConfidenceErrors.length,
    distinctErrorTurns,
    distinctErrorSessions,
  };
}

function priorityScoreFor(
  persistence: PersistenceState,
  successfulTransfers: number,
  failedTransfers: number,
): number {
  const base: Record<PersistenceState, number> = {
    none: 0,
    temporary: 1,
    suspected: 2,
    persistent: 3,
  };
  return Math.max(0, Math.min(3, base[persistence] + failedTransfers - successfulTransfers));
}

function priorityFor(score: number): ReviewPriority {
  if (score >= 3) return "high";
  if (score >= 1) return "normal";
  return "low";
}

export function projectSkillState(
  skillId: SkillId,
  events: readonly EvidenceEvent[],
  items?: ReadonlyMap<string, LearningItem>,
): SkillState {
  const relevant = events
    .filter((event) => resolveSkillId(event, items) === skillId)
    .sort(compareEvidence);
  const attempts = relevant.filter(isAttemptEvidence);
  const successfulAttempts = attempts.filter((event) => normalizeOutcome(event.outcome) === "success").length;
  const failedAttempts = attempts.filter((event) => normalizeOutcome(event.outcome) === "failure").length;
  const uncertainAttempts = attempts.filter((event) => normalizeOutcome(event.outcome) === "uncertain").length;
  const transfers = relevant.filter((event) => event.type === "transfer_success" || event.type === "transfer_failure");
  const successfulTransfers = transfers.filter(isSuccessfulTransfer).length;
  const failedTransfers = transfers.filter(isFailedTransfer).length;
  const persistence = assessPersistence(relevant);
  const priorityScore = priorityScoreFor(
    persistence.persistence,
    successfulTransfers,
    failedTransfers,
  );
  const errorEvents = relevant.filter(
    (event) => isAttemptEvidence(event) && normalizeOutcome(event.outcome) === "failure",
  );
  const priority = priorityFor(priorityScore);

  return {
    skillId,
    evidenceCount: relevant.length,
    successfulAttempts,
    failedAttempts,
    errorCount: failedAttempts,
    uncertainAttempts,
    highConfidenceErrors: persistence.highConfidenceErrors,
    distinctTurns: new Set(errorEvents.map((event) => event.context.turnId ?? event.id)).size,
    distinctSessions: new Set(errorEvents.map((event) => event.sessionId)).size,
    successfulTransfers,
    failedTransfers,
    persistence: persistence.persistence,
    priority,
    reviewPriority: priority,
    priorityScore,
    lastEvidenceAt: relevant.at(-1)?.createdAt,
    lastErrorAt: errorEvents.at(-1)?.createdAt,
  };
}

export function projectSkills(
  events: readonly EvidenceEvent[],
  items: readonly LearningItem[] = [],
): ReadonlyMap<SkillId, SkillState> {
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const skillIds = new Set(events.map((event) => resolveSkillId(event, itemMap)));
  return new Map([...skillIds].sort().map((skillId) => [skillId, projectSkillState(skillId, events, itemMap)]));
}

export const computeSkillProjection = projectSkillState;
