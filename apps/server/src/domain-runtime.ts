import { createRequire } from "node:module";
import { resolve } from "node:path";
import type {
  EvidenceEvent,
  EvidenceOutcome,
  LearningItem,
  ReviewItem,
  ReviewPriority,
  SkillState,
} from "../../../packages/contracts/dist/index.js";

interface LearningDomainRuntime {
  readonly validateEvidenceEvent: (event: EvidenceEvent) => void;
  readonly evaluateTransfer: (input: unknown) => {
    readonly isTransfer: boolean;
    readonly outcome: "success" | "failure" | "uncertain" | "not_transfer";
    readonly changedDimensions: readonly string[];
    readonly reason: string;
  };
  readonly projectSkills: (events: readonly EvidenceEvent[], items?: readonly LearningItem[]) => ReadonlyMap<string, SkillState>;
  readonly reviewSignalsFromEvidence: (events: readonly EvidenceEvent[], now: Date | string) => {
    readonly failedTransfer?: boolean;
    readonly repeatedHighConfidenceError?: boolean;
    readonly longInactivity?: boolean;
  };
  readonly createReviewItem: (input: {
    readonly id: string;
    readonly learnerId: string;
    readonly itemId: string;
    readonly skillId: string;
    readonly now: Date | string;
    readonly successfulReviews: number;
    readonly failedTransfer?: boolean;
    readonly repeatedHighConfidenceError?: boolean;
    readonly longInactivity?: boolean;
    readonly priority?: ReviewPriority;
    readonly priorityScore?: number;
  }) => ReviewItem;
  readonly normalizeOutcome: (outcome: EvidenceOutcome) => "success" | "failure" | "uncertain";
}

/** Resolve the compiled learning kernel from both source and dist/server layouts. */
const require = createRequire(import.meta.url);
export const domain = require(resolve(process.cwd(), "packages/domain/dist/index.js")) as LearningDomainRuntime;
