import type {
  ConsentPolicy,
  RoastDecision,
  RoastGateReason,
  RoastRequest,
} from "../../contracts/src/index.js";

const UNSAFE_ROAST_TERMS = [
  /\b(?:idiot|stupid|dumb|moron|imbecile)\b/i,
  /\b(?:ugly|fat|cripple|retard)\b/i,
  /\b(?:kill|die|hurt|threat)\b/i,
  /\b(?:slur|caste|religion|race|gender|disab(?:led|ility)|nationality)\b/i,
  /\b(?:sex|sexual|humiliat(?:e|ion))\b/i,
];

export interface RoastState {
  readonly usedCorrectionIds: readonly string[];
}

export interface RoastOutput {
  readonly correction: string;
  readonly roast?: string;
  readonly decision: RoastDecision;
}

export function defaultConsentPolicy(): ConsentPolicy {
  return {
    adultUser: false,
    explicitOptIn: false,
    sessionMode: "off",
    noSafetyRestriction: true,
  };
}

export function canUseRoast(policy: ConsentPolicy): boolean {
  return evaluateRoastGate(policy).allowed;
}

export function roastAllowed(policy: ConsentPolicy): boolean {
  return canUseRoast(policy);
}

export function evaluateRoastGate(
  policy: ConsentPolicy,
  request?: RoastRequest,
  state: RoastState = { usedCorrectionIds: [] },
): RoastDecision {
  if (!policy.adultUser) return { allowed: false, reason: "not_adult" };
  if (!policy.explicitOptIn) return { allowed: false, reason: "not_opted_in" };
  if (policy.sessionMode === "off") return { allowed: false, reason: "session_off" };
  if (policy.noSafetyRestriction === false) return { allowed: false, reason: "safety_restricted" };
  if (request && (!request.correctionId || !request.correctionText.trim())) {
    return { allowed: false, reason: "correction_missing" };
  }
  if (request && state.usedCorrectionIds.includes(request.correctionId)) {
    return { allowed: false, reason: "already_used" };
  }
  if (request && request.requestedText && !isSafeRoastText(request.requestedText)) {
    return { allowed: false, reason: "unsafe_content" };
  }
  return { allowed: true, reason: "allowed" };
}

export function isSafeRoastText(text: string): boolean {
  const normalized = text.trim();
  return normalized.length > 0 && normalized.length <= 160 && !UNSAFE_ROAST_TERMS.some((term) => term.test(normalized));
}

export function validateRoastText(text: string): RoastDecision {
  return isSafeRoastText(text)
    ? { allowed: true, reason: "allowed" }
    : { allowed: false, reason: "unsafe_content" };
}

export function disableRoastFromUtterance(
  policy: ConsentPolicy,
  utterance: string,
): ConsentPolicy {
  if (!/\bstop\s+roasting\s+me\b/i.test(utterance)) return policy;
  return { ...policy, explicitOptIn: false, sessionMode: "off" };
}

export function composeCorrection(
  policy: ConsentPolicy,
  request: RoastRequest,
  state: RoastState,
): RoastOutput {
  const decision = evaluateRoastGate(policy, request, state);
  const roast = decision.allowed && request.requestedText && isSafeRoastText(request.requestedText)
    ? request.requestedText
    : undefined;
  return { correction: request.correctionText, roast, decision };
}

export function markRoastUsed(state: RoastState, correctionId: string): RoastState {
  return state.usedCorrectionIds.includes(correctionId)
    ? state
    : { usedCorrectionIds: [...state.usedCorrectionIds, correctionId] };
}

export type { RoastGateReason };
