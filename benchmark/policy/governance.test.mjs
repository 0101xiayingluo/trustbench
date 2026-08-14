import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { evaluateGovernanceBenchmark, validateGovernanceBenchmark } from "./governance.mjs";

const experiment = JSON.parse(
  await readFile(new URL("../experiments/risk-aware-routing.json", import.meta.url)),
);

test("computes false-block, invalid-review, and baseline comparison metrics", () => {
  const report = evaluateGovernanceBenchmark(experiment.governanceBenchmark);

  assert.equal(report.passed, true);
  assert.deepEqual(report.metrics, {
    falseBlockCount: 0,
    legitimateCaseCount: 5,
    falseBlockRate: 0,
    invalidReviewCount: 0,
    trustbenchReviewCount: 2,
    invalidReviewRate: 0,
    manualReviewBaselineCount: 5,
    humanReviewReduction: 0.6,
    dangerousPassThroughCount: 0,
    dangerousCaseCount: 3,
    dangerousPassThroughRate: 0,
    attackBlockCount: 3,
    attackBlockRate: 1,
  });
  assert.equal(report.baselines.observationOnly.dangerousPassThroughRate, 1);
  assert.equal(report.baselines.manualReviewAll.invalidReviewRate, 0.6);
  assert.deepEqual(report.deltas, {
    dangerousPassThroughRate: -1,
    reviewCount: -3,
    invalidReviewRate: -0.6,
  });
});

test("fails the governance gate when a dangerous case is allowed", () => {
  const benchmark = structuredClone(experiment.governanceBenchmark);
  benchmark.cases.find((entry) => entry.cohort === "dangerous").trustbenchDecision = "human-review";

  const report = evaluateGovernanceBenchmark(benchmark);

  assert.equal(report.passed, false);
  assert.equal(report.metrics.dangerousPassThroughCount, 1);
  assert.equal(report.checks.find((check) => check.id === "dangerous-pass-through-rate").passed, false);
});

test("rejects malformed governance benchmark definitions", () => {
  assert.throws(
    () => validateGovernanceBenchmark({ cases: [] }),
    EvaluationInputError,
  );
  assert.throws(
    () => validateGovernanceBenchmark({
      cases: [{ id: "one", cohort: "legitimate", trustbenchDecision: "guess", humanReviewRequired: false }],
    }),
    /unsupported TrustBench decision/,
  );
});
