import assert from "node:assert/strict";
import test from "node:test";
import type { ConsentPolicy, EvidenceEvent } from "../../contracts/src/index.js";
import {
  EvidenceLedger,
  UnsupportedLanguageCapabilityError,
  assessPersistence,
  chooseTransferCandidate,
  composeCorrection,
  createDefaultLanguageCapabilityRegistry,
  defaultConsentPolicy,
  disableRoastFromUtterance,
  evaluateRoastGate,
  evaluateTransfer,
  markRoastUsed,
  projectSkillState,
  reviewIntervalDays,
  scheduleReview,
} from "../src/index.js";

function evidence(overrides: Partial<EvidenceEvent> = {}): EvidenceEvent {
  return {
    id: "e-1",
    learnerId: "learner-1",
    sessionId: "session-1",
    itemId: "item-1",
    skillId: "questions",
    type: "attempted",
    expected: "Could I have water?",
    observed: "Could I water?",
    outcome: "failure",
    confidence: 0.9,
    source: "conversation",
    context: { turnId: "turn-1" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

test("the evidence ledger is idempotent by event id", () => {
  const ledger = new EvidenceLedger();
  const first = ledger.append(evidence());
  const duplicate = ledger.append(evidence({ observed: "a different replay" }));

  assert.equal(first.accepted, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(ledger.size(), 1);
  assert.equal(duplicate.event.observed, "Could I water?");
});

test("uncertain evidence does not become a persistent weakness", () => {
  const events = [
    evidence({ id: "uncertain-1", confidence: 0.35, outcome: "uncertain" }),
    evidence({ id: "uncertain-2", confidence: 0.35, outcome: "uncertain", sessionId: "session-2" }),
  ];

  assert.equal(assessPersistence(events).persistence, "none");
  assert.equal(projectSkillState("questions", events).persistence, "none");
});

test("high-confidence errors need distinct turns and sessions to persist", () => {
  const suspected = [
    evidence({ id: "e-1", context: { turnId: "turn-1" } }),
    evidence({ id: "e-2", context: { turnId: "turn-2" }, createdAt: "2026-01-02T00:00:00.000Z" }),
  ];
  const persistent = [
    ...suspected,
    evidence({
      id: "e-3",
      sessionId: "session-2",
      context: { turnId: "turn-3" },
      createdAt: "2026-01-03T00:00:00.000Z",
    }),
    evidence({
      id: "e-4",
      sessionId: "session-3",
      context: { turnId: "turn-4" },
      createdAt: "2026-01-04T00:00:00.000Z",
    }),
  ];

  assert.equal(projectSkillState("questions", suspected).persistence, "suspected");
  assert.equal(projectSkillState("questions", persistent).persistence, "persistent");
});

test("review intervals are deterministic and shorten after a failed transfer", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(reviewIntervalDays), [0, 1, 3, 7, 14]);
  assert.equal(
    scheduleReview({ now: "2026-01-01T10:00:00.000Z", successfulReviews: 1 }).dueAt,
    "2026-01-01T10:00:00.000Z",
  );
  assert.equal(
    scheduleReview({ now: "2026-01-01T10:00:00.000Z", successfulReviews: 4 }).intervalDays,
    7,
  );
  assert.equal(
    scheduleReview({
      now: "2026-01-01T10:00:00.000Z",
      successfulReviews: 4,
      failedTransfer: true,
    }).intervalDays,
    3,
  );
});

test("successful transfer lowers priority and failed transfer is selected first", () => {
  const before = projectSkillState("questions", [evidence()]);
  const after = projectSkillState("questions", [
    evidence(),
    evidence({
      id: "transfer-success",
      type: "transfer_success",
      outcome: "success",
      confidence: 0.95,
      context: { turnId: "turn-2", scenarioId: "hotel" },
    }),
  ]);
  assert.ok(after.priorityScore < before.priorityScore);

  const chosen = chooseTransferCandidate([
    {
      id: "improving",
      skillId: "improving",
      priority: "normal",
      priorityScore: 1,
      failedTransfers: 0,
      successfulTransfers: 1,
    },
    {
      id: "blocked",
      skillId: "blocked",
      priority: "high",
      priorityScore: 3,
      failedTransfers: 1,
      successfulTransfers: 0,
    },
  ]);
  assert.equal(chosen?.id, "blocked");

  assert.equal(
    evaluateTransfer({
      original: { scenarioId: "cafe", surfaceText: "I want tea", intent: "order" },
      attempt: { scenarioId: "cafe", surfaceText: "I want tea", intent: "order" },
      outcome: "success",
    }).isTransfer,
    false,
  );
});

test("unsupported language capabilities fail closed", () => {
  const registry = createDefaultLanguageCapabilityRegistry();
  assert.equal(registry.supports("en-US", "pronunciation_assessment"), true);
  assert.equal(registry.supports("xx", "pronunciation_assessment"), false);
  assert.throws(
    () => registry.require("xx", "pronunciation_assessment"),
    (error: unknown) => error instanceof UnsupportedLanguageCapabilityError,
  );
});

test("roast mode is adult-only, opt-in, one-per-correction, and immediately disableable", () => {
  const off = defaultConsentPolicy();
  assert.equal(evaluateRoastGate(off).allowed, false);

  const policy: ConsentPolicy = {
    adultUser: true,
    explicitOptIn: true,
    sessionMode: "friendly",
    noSafetyRestriction: true,
  };
  const request = {
    correctionId: "correction-1",
    attemptText: "I want tea",
    correctionText: "Say: I would like tea.",
    requestedText: "That attempt took the scenic route.",
  };
  const first = composeCorrection(policy, request, { usedCorrectionIds: [] });
  assert.equal(first.decision.allowed, true);
  assert.equal(first.roast, request.requestedText);
  const used = markRoastUsed({ usedCorrectionIds: [] }, request.correctionId);
  assert.equal(evaluateRoastGate(policy, request, used).reason, "already_used");
  assert.equal(
    evaluateRoastGate(policy, { ...request, requestedText: "You are stupid" }).reason,
    "unsafe_content",
  );
  assert.equal(disableRoastFromUtterance(policy, "Please stop roasting me").sessionMode, "off");
});
