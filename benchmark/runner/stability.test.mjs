import assert from "node:assert/strict";
import test from "node:test";
import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { summarizeStabilityRounds } from "./stability.mjs";

function round(outcomes, complete = true) {
  return {
    complete,
    cases: Object.entries(outcomes).map(([id, passed]) => ({ id, taskId: `task.${id}`, passed })),
  };
}

test("summarizes a stable multi-round regression", () => {
  const report = summarizeStabilityRounds([
    round({ one: true, two: true }),
    round({ one: true, two: true }),
    round({ one: true, two: true }),
  ]);

  assert.equal(report.totalExecutions, 6);
  assert.equal(report.passedExecutions, 6);
  assert.equal(report.stableCaseCount, 2);
  assert.equal(report.flakyCaseCount, 0);
  assert.equal(report.releaseDecision.status, "go");
});
test("marks inconsistent or failed cases as no-go", () => {
  const report = summarizeStabilityRounds([
    round({ one: true, two: true }),
    round({ one: false, two: true }),
    round({ one: true, two: true }),
  ]);

  assert.equal(report.flakyCaseCount, 1);
  assert.equal(report.consistentlyPassedCaseCount, 1);
  assert.equal(report.releaseDecision.status, "no-go");
});

test("rejects incomparable stability rounds", () => {
  assert.throws(
    () => summarizeStabilityRounds([round({ one: true }), round({ two: true })]),
    EvaluationInputError,
  );
});
