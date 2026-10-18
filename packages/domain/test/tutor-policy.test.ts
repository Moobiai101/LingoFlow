import assert from "node:assert/strict";
import test from "node:test";
import {
  composeTutorTurn,
  defaultConsentPolicy,
  getTutorPolicy,
  type TutorPersona,
} from "../src/index.js";

const correction = {
  correctionId: "correction-1",
  attemptText: "I want tea",
  correctionText: "Say: I would like tea.",
  requestedText: "That attempt took the scenic route.",
};

test("each tutor persona produces deterministic, distinct teaching behavior", () => {
  const personas: readonly TutorPersona[] = [
    "patient_mentor",
    "funny_friend",
    "strict_coach",
    "professional_coach",
  ];
  const policies = personas.map(getTutorPolicy);

  assert.equal(policies[0]?.correctionTiming, "after_turn");
  assert.equal(policies[0]?.hintStyle, "progressive");
  assert.equal(policies[0]?.explanationLanguage, "native");
  assert.equal(policies[1]?.correctionTiming, "delayed");
  assert.equal(policies[1]?.hintStyle, "playful");
  assert.equal(policies[2]?.correctionTiming, "immediate");
  assert.equal(policies[2]?.maxHintsPerTurn, 0);
  assert.equal(policies[3]?.retryBudget, 1);

  const signatures = policies.map((policy) =>
    [
      policy.correctionTiming,
      policy.hintStyle,
      policy.explanationLanguage,
      policy.retryBudget,
      policy.transferEmphasis,
    ].join("|"),
  );
  assert.equal(new Set(signatures).size, personas.length);
});

test("roast remains off by default when composing a tutor turn", () => {
  const plan = composeTutorTurn({ persona: "funny friend", correction });

  assert.equal(plan.correctionText, correction.correctionText);
  assert.equal(plan.roast, undefined);
  assert.equal(plan.roastDecision.allowed, false);
  assert.equal(plan.roastDecision.reason, "not_adult");
});

test("an adult opt-in policy composes one safe roast without dropping correction", () => {
  const plan = composeTutorTurn({
    persona: "funny_friend",
    correction,
    roastPolicy: {
      adultUser: true,
      explicitOptIn: true,
      sessionMode: "friendly",
      noSafetyRestriction: true,
    },
  });

  assert.equal(plan.correctionText, correction.correctionText);
  assert.equal(plan.roast, correction.requestedText);
  assert.equal(plan.roastDecision.allowed, true);

  const disabled = composeTutorTurn({
    persona: "funny_friend",
    correction,
    roastPolicy: defaultConsentPolicy(),
  });
  assert.equal(disabled.roast, undefined);
});
