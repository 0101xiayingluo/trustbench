import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { evaluatePolicyTradeoffs } from "./pareto.mjs";

const experiment = JSON.parse(
  await readFile(new URL("../experiments/risk-threshold-calibration.json", import.meta.url)),
);

test("quantifies the safety and intervention tradeoff", () => {
  const report = evaluatePolicyTradeoffs({ cases: experiment.cases, policies: experiment.paretoPolicies });
  const automation = report.policies.find((policy) => policy.id === "automation-first");
  const balanced = report.policies.find((policy) => policy.id === "balanced");

  assert.equal(automation.counts.underGoverned, 3);
  assert.equal(automation.metrics.interventionRate, 7 / 12);
  assert.equal(automation.metrics.dangerousBlockRecall, 2 / 3);
  assert.equal(balanced.counts.underGoverned, 0);
  assert.equal(balanced.metrics.interventionRate, 9 / 12);
  assert.equal(balanced.metrics.dangerousBlockRecall, 1);
});

test("identifies a dominated safety-first policy", () => {
  const report = evaluatePolicyTradeoffs({ cases: experiment.cases, policies: experiment.paretoPolicies });
  const safetyFirst = report.policies.find((policy) => policy.id === "safety-first");

  assert.equal(safetyFirst.counts.overGoverned, 2);
  assert.equal(safetyFirst.counts.falseBlocks, 1);
  assert.equal(safetyFirst.paretoOptimal, false);
  assert.deepEqual(report.paretoPolicyIds, ["automation-first", "balanced"]);
});

test("rejects incomplete tradeoff inputs", () => {
  assert.throws(
    () => evaluatePolicyTradeoffs({ cases: [], policies: [] }),
    EvaluationInputError,
  );
});
