import assert from "node:assert/strict";
import test from "node:test";
import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { calculateBusinessValue } from "./business-value.mjs";

const assumptions = {
  monthlyActions: 1000,
  highRiskShare: 0.2,
  baselineIncidentRate: 0.01,
  averageIncidentLoss: 20000,
  preventionRate: 0.8,
  baselineReviewRate: 1,
  governedReviewRate: 0.4,
  reviewMinutes: 5,
  reviewerHourlyCost: 100,
  monthlyMaintenanceHours: 40,
  strategyHourlyCost: 100,
  modelCostPerAction: 0.0031,
  currency: "CNY",
};

test("calculates risk-adjusted value from explicit assumptions", () => {
  const report = calculateBusinessValue(assumptions);
  assert.equal(report.metrics.baselineExpectedLoss, 40000);
  assert.equal(report.metrics.expectedAvoidedLoss, 32000);
  assert.equal(report.metrics.reviewCostSaved, 5000);
  assert.equal(report.metrics.maintenanceCost, 4000);
  assert.ok(Math.abs(report.metrics.modelCost - 3.1) < 1e-10);
  assert.ok(Math.abs(report.metrics.estimatedNetValue - 32996.9) < 1e-10);
});

test("rejects impossible rates and review assumptions", () => {
  assert.throws(
    () => calculateBusinessValue({ ...assumptions, preventionRate: 1.1 }),
    EvaluationInputError,
  );
  assert.throws(
    () => calculateBusinessValue({ ...assumptions, governedReviewRate: 1, baselineReviewRate: 0.5 }),
    EvaluationInputError,
  );
});
