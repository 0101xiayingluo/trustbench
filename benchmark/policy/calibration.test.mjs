import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { evaluateCalibrationExperiment, validateCalibrationExperiment } from "./calibration.mjs";

const experiment = JSON.parse(
  await readFile(new URL("../experiments/risk-threshold-calibration.json", import.meta.url)),
);

test("captures the threshold calibration iteration", () => {
  const report = evaluateCalibrationExperiment(experiment);
  const v0 = report.policies.find((policy) => policy.id === "v0-50-80");
  const v1 = report.policies.find((policy) => policy.id === "v1-40-70");

  assert.equal(report.caseCount, 12);
  assert.equal(v0.misrouteCount, 3);
  assert.equal(v0.underGovernedCount, 3);
  assert.equal(v1.misrouteCount, 0);
  assert.equal(report.improvement.misrouteRateDelta, -0.25);
});
test("retains boundary evidence for every policy version", () => {
  const report = evaluateCalibrationExperiment(experiment);
  const v1 = report.policies.at(-1);

  assert.equal(v1.cases.find((entry) => entry.score === 39).predictedDecision, "auto-approve");
  assert.equal(v1.cases.find((entry) => entry.score === 40).predictedDecision, "human-review");
  assert.equal(v1.cases.find((entry) => entry.score === 70).predictedDecision, "human-review");
  assert.equal(v1.cases.find((entry) => entry.score === 75).predictedDecision, "block");
});

test("rejects malformed calibration data", () => {
  assert.throws(
    () => validateCalibrationExperiment({ policies: [], cases: [] }),
    EvaluationInputError,
  );
});
