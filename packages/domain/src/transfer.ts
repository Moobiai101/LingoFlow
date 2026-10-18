import type { EvidenceOutcome } from "../../contracts/src/index.js";
import type { ReviewPriority, SkillId } from "../../contracts/src/index.js";
import { normalizeOutcome } from "./evidence.js";

export interface TransferVariant {
  readonly scenarioId?: string;
  readonly vocabularyKey?: string;
  readonly surfaceText?: string;
  readonly intent?: string;
}

export interface TransferAttempt {
  readonly original: TransferVariant;
  readonly attempt: TransferVariant;
  readonly outcome: EvidenceOutcome;
}

export interface TransferAssessment {
  readonly isTransfer: boolean;
  readonly outcome: "success" | "failure" | "uncertain" | "not_transfer";
  readonly changedDimensions: readonly string[];
  readonly reason: "new_context" | "exact_repetition" | "unsuccessful" | "uncertain";
}

function changedDimensions(original: TransferVariant, attempt: TransferVariant): string[] {
  const dimensions: Array<keyof TransferVariant> = [
    "scenarioId",
    "vocabularyKey",
    "surfaceText",
    "intent",
  ];
  return dimensions.filter((dimension) => {
    const before = original[dimension]?.trim().toLocaleLowerCase();
    const after = attempt[dimension]?.trim().toLocaleLowerCase();
    return before !== undefined && after !== undefined && before !== after;
  });
}

export function evaluateTransfer(attempt: TransferAttempt): TransferAssessment {
  const changed = changedDimensions(attempt.original, attempt.attempt);
  const exactRepetition = changed.length === 0;
  if (exactRepetition) {
    return {
      isTransfer: false,
      outcome: "not_transfer",
      changedDimensions: changed,
      reason: "exact_repetition",
    };
  }
  const outcome = normalizeOutcome(attempt.outcome);
  return {
    isTransfer: true,
    outcome,
    changedDimensions: changed,
    reason: outcome === "uncertain" ? "uncertain" : "new_context",
  };
}

export interface TransferCandidate {
  readonly id: string;
  readonly skillId: SkillId;
  readonly priority: ReviewPriority;
  readonly priorityScore: number;
  readonly failedTransfers: number;
  readonly successfulTransfers: number;
  readonly dueAt?: string;
}

/** Stable ordering keeps transfer choices explainable across runs. */
export function prioritizeTransferCandidates(
  candidates: readonly TransferCandidate[],
): readonly TransferCandidate[] {
  return [...candidates].sort((left, right) => {
    if (right.priorityScore !== left.priorityScore) return right.priorityScore - left.priorityScore;
    if (right.failedTransfers !== left.failedTransfers) return right.failedTransfers - left.failedTransfers;
    if (left.successfulTransfers !== right.successfulTransfers) {
      return left.successfulTransfers - right.successfulTransfers;
    }
    const leftDue = left.dueAt ?? "";
    const rightDue = right.dueAt ?? "";
    const byDue = leftDue.localeCompare(rightDue);
    return byDue === 0 ? left.id.localeCompare(right.id) : byDue;
  });
}

export const prioritizeTransfer = prioritizeTransferCandidates;

export function chooseTransferCandidate(
  candidates: readonly TransferCandidate[],
): TransferCandidate | undefined {
  return prioritizeTransferCandidates(candidates)[0];
}
