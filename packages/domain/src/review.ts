import type {
  EvidenceEvent,
  LearningItemId,
  ReviewItem,
  ReviewPriority,
  ReviewReason,
  SkillId,
} from "../../contracts/src/index.js";
import { HIGH_CONFIDENCE_THRESHOLD, normalizeOutcome } from "./evidence.js";

export const REVIEW_INTERVALS_DAYS = [0, 1, 3, 7, 14] as const;
export const LONG_INACTIVITY_DAYS = 30;

export interface ReviewScheduleInput {
  readonly now: Date | string;
  readonly successfulReviews: number;
  readonly failedTransfer?: boolean;
  readonly repeatedHighConfidenceError?: boolean;
  readonly longInactivity?: boolean;
}

export interface ReviewSchedule {
  readonly dueAt: string;
  readonly intervalDays: number;
  readonly index: number;
  readonly reason: ReviewReason;
}

function asDate(value: Date | string): Date {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Review date must be valid");
  return date;
}

export function reviewIntervalDays(successfulReviews: number): number {
  // Review counts are one-based: the first success is same-day, the second
  // success is tomorrow, and so on. A zero count is a safe same-day default.
  const index = Math.max(
    0,
    Math.min(REVIEW_INTERVALS_DAYS.length - 1, Math.floor(successfulReviews) - 1),
  );
  return REVIEW_INTERVALS_DAYS[index] ?? 0;
}

export function scheduleReview(input: ReviewScheduleInput): ReviewSchedule {
  const shortened = Boolean(input.failedTransfer || input.repeatedHighConfidenceError || input.longInactivity);
  const baseIndex = Math.max(
    0,
    Math.min(REVIEW_INTERVALS_DAYS.length - 1, Math.floor(input.successfulReviews) - 1),
  );
  const index = Math.max(0, baseIndex - (shortened ? 1 : 0));
  const intervalDays = REVIEW_INTERVALS_DAYS[index] ?? 0;
  const due = asDate(input.now);
  due.setUTCDate(due.getUTCDate() + intervalDays);
  const reason: ReviewReason = input.failedTransfer
    ? "failed_transfer"
    : input.repeatedHighConfidenceError
      ? "repeated_error"
      : input.longInactivity
        ? "long_inactivity"
        : "due_for_review";

  return { dueAt: due.toISOString(), intervalDays, index, reason };
}

export const scheduleNextReview = scheduleReview;
export const getReviewIntervalDays = reviewIntervalDays;

export interface CreateReviewItemInput extends ReviewScheduleInput {
  readonly id: string;
  readonly learnerId: string;
  readonly itemId: LearningItemId;
  readonly skillId: SkillId;
  readonly priority?: ReviewPriority;
  readonly priorityScore?: number;
}

export function createReviewItem(input: CreateReviewItemInput): ReviewItem {
  const schedule = scheduleReview(input);
  return {
    id: input.id,
    learnerId: input.learnerId,
    itemId: input.itemId,
    skillId: input.skillId,
    dueAt: schedule.dueAt,
    intervalDays: schedule.intervalDays,
    successfulReviews: input.successfulReviews,
    priority: input.priority ?? "normal",
    priorityScore: input.priorityScore ?? 1,
    reason: schedule.reason,
  };
}

export interface ReviewSignal {
  readonly failedTransfer?: boolean;
  readonly repeatedHighConfidenceError?: boolean;
  readonly longInactivity?: boolean;
}

export function reviewSignalsFromEvidence(
  events: readonly EvidenceEvent[],
  now: Date | string,
): ReviewSignal {
  const failures = events.filter((event) => normalizeOutcome(event.outcome) === "failure");
  const highConfidenceErrors = failures.filter((event) => event.confidence >= HIGH_CONFIDENCE_THRESHOLD);
  const sessions = new Set(highConfidenceErrors.map((event) => event.sessionId));
  const latest = events
    .map((event) => new Date(event.createdAt).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => right - left)[0];
  const nowTime = asDate(now).getTime();

  return {
    failedTransfer: events.some(
      (event) => event.type === "transfer_failure" && normalizeOutcome(event.outcome) === "failure",
    ),
    repeatedHighConfidenceError: highConfidenceErrors.length >= 2 && sessions.size >= 1,
    longInactivity: latest !== undefined && nowTime - latest >= LONG_INACTIVITY_DAYS * 86_400_000,
  };
}
