import type {
  ConsentPolicy,
  RoastDecision,
  RoastRequest,
} from "../../contracts/src/index.js";
import {
  composeCorrection,
  defaultConsentPolicy,
  type RoastState,
} from "./roast.js";

export const TUTOR_PERSONAS = [
  "patient_mentor",
  "funny_friend",
  "strict_coach",
  "professional_coach",
] as const;

export type TutorPersona = (typeof TUTOR_PERSONAS)[number];
export type CorrectionTiming = "immediate" | "after_turn" | "delayed";
export type HintStyle = "progressive" | "playful" | "minimal";
export type ExplanationLanguage = "native" | "target" | "bilingual";
export type TransferEmphasis = "low" | "medium" | "high";

export interface TutorPolicy {
  readonly persona: TutorPersona;
  readonly correctionTiming: CorrectionTiming;
  readonly hintStyle: HintStyle;
  readonly explanationLanguage: ExplanationLanguage;
  readonly retryBudget: number;
  readonly transferEmphasis: TransferEmphasis;
  readonly maxHintsPerTurn: number;
}

export interface TutorTurnPlan {
  readonly policy: TutorPolicy;
  readonly correctionText: string;
  readonly correctionTiming: CorrectionTiming;
  readonly hintStyle: HintStyle;
  readonly explanationLanguage: ExplanationLanguage;
  readonly retryBudget: number;
  readonly transferEmphasis: TransferEmphasis;
  readonly maxHintsPerTurn: number;
  readonly roast?: string;
  readonly roastDecision: RoastDecision;
}

export interface ComposeTutorTurnInput {
  readonly persona: TutorPersona | string;
  readonly correction: RoastRequest;
  readonly roastPolicy?: ConsentPolicy;
  readonly roastState?: RoastState;
}

const POLICIES: Readonly<Record<TutorPersona, TutorPolicy>> = {
  patient_mentor: {
    persona: "patient_mentor",
    correctionTiming: "after_turn",
    hintStyle: "progressive",
    explanationLanguage: "native",
    retryBudget: 3,
    transferEmphasis: "medium",
    maxHintsPerTurn: 2,
  },
  funny_friend: {
    persona: "funny_friend",
    correctionTiming: "delayed",
    hintStyle: "playful",
    explanationLanguage: "bilingual",
    retryBudget: 2,
    transferEmphasis: "low",
    maxHintsPerTurn: 1,
  },
  strict_coach: {
    persona: "strict_coach",
    correctionTiming: "immediate",
    hintStyle: "minimal",
    explanationLanguage: "target",
    retryBudget: 2,
    transferEmphasis: "high",
    maxHintsPerTurn: 0,
  },
  professional_coach: {
    persona: "professional_coach",
    correctionTiming: "after_turn",
    hintStyle: "minimal",
    explanationLanguage: "target",
    retryBudget: 1,
    transferEmphasis: "high",
    maxHintsPerTurn: 0,
  },
};

function normalizedPersona(persona: TutorPersona | string): TutorPersona | undefined {
  const candidate = persona.trim().toLowerCase().replace(/[ -]+/g, "_");
  return (TUTOR_PERSONAS as readonly string[]).includes(candidate)
    ? (candidate as TutorPersona)
    : undefined;
}

export function isTutorPersona(value: string): value is TutorPersona {
  return normalizedPersona(value) !== undefined;
}

export function getTutorPolicy(persona: TutorPersona | string): TutorPolicy {
  const normalized = normalizedPersona(persona);
  if (!normalized) throw new Error(`Unsupported tutor persona: ${persona}`);
  return POLICIES[normalized];
}

export const tutorPolicyFor = getTutorPolicy;

/**
 * Build the complete teaching decision for one correction. Roast text is only
 * present when the existing consent gate allows it; correction text is always
 * retained, so personality can never replace useful teaching.
 */
export function composeTutorTurn(input: ComposeTutorTurnInput): TutorTurnPlan {
  const policy = getTutorPolicy(input.persona);
  const correction = composeCorrection(
    input.roastPolicy ?? defaultConsentPolicy(),
    input.correction,
    input.roastState ?? { usedCorrectionIds: [] },
  );

  return {
    policy,
    correctionText: correction.correction,
    correctionTiming: policy.correctionTiming,
    hintStyle: policy.hintStyle,
    explanationLanguage: policy.explanationLanguage,
    retryBudget: policy.retryBudget,
    transferEmphasis: policy.transferEmphasis,
    maxHintsPerTurn: policy.maxHintsPerTurn,
    roast: correction.roast,
    roastDecision: correction.decision,
  };
}
