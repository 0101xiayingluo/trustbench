import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { evaluateRiskPolicy } from "./risk.mjs";

const decisions = ["auto-approve", "human-review", "block"];

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function validateThresholds(thresholds, label) {
  if (!isRecord(thresholds)
    || !Number.isFinite(thresholds.autoApproveBelow)
    || !Number.isFinite(thresholds.blockAbove)
    || thresholds.autoApproveBelow < 0
    || thresholds.blockAbove < thresholds.autoApproveBelow) {
    throw new EvaluationInputError(`${label} thresholds are invalid.`);
  }
}

export function validateCalibrationExperiment(experiment) {
  if (!isRecord(experiment)) throw new EvaluationInputError("Calibration experiment must be an object.");
  if (!Array.isArray(experiment.policies) || experiment.policies.length < 2) {
    throw new EvaluationInputError("Calibration experiment requires at least two policy versions.");
  }
  if (!Array.isArray(experiment.cases) || experiment.cases.length === 0) {
    throw new EvaluationInputError("Calibration experiment cases must be a non-empty array.");
  }
  const policyIds = new Set();
  for (const policy of experiment.policies) {
    if (!isRecord(policy) || typeof policy.id !== "string" || !policy.id || policyIds.has(policy.id)) {
      throw new EvaluationInputError("Calibration policies must have unique non-empty ids.");
    }
    policyIds.add(policy.id);
    validateThresholds(policy.thresholds, `Calibration policy ${policy.id}`);
  }
  const caseIds = new Set();
  for (const entry of experiment.cases) {
    if (!isRecord(entry) || typeof entry.id !== "string" || !entry.id || caseIds.has(entry.id)) {
      throw new EvaluationInputError("Calibration cases must have unique non-empty ids.");
    }
    caseIds.add(entry.id);
    if (!Number.isFinite(entry.score) || entry.score < 0 || entry.score > 100) {
      throw new EvaluationInputError(`Calibration case ${entry.id} score must be between 0 and 100.`);
    }
    if (!decisions.includes(entry.goldDecision)) {
      throw new EvaluationInputError(`Calibration case ${entry.id} goldDecision is invalid.`);
    }
  }
  return experiment;
}

export function evaluateCalibrationExperiment(experiment) {
  validateCalibrationExperiment(experiment);
  const decisionRank = new Map(decisions.map((decision, index) => [decision, index]));
  const policies = experiment.policies.map((policy) => {
    const cases = experiment.cases.map((entry) => {
      const predictedDecision = evaluateRiskPolicy({
        thresholds: policy.thresholds,
        signals: [{ id: "calibrated-score", label: "校准分数", weight: entry.score, active: true }],
      }).decision;
      return {
        id: entry.id,
        score: entry.score,
        goldDecision: entry.goldDecision,
        predictedDecision,
        matched: predictedDecision === entry.goldDecision,
        severity: predictedDecision === entry.goldDecision
          ? "matched"
          : decisionRank.get(predictedDecision) < decisionRank.get(entry.goldDecision)
            ? "under-governed"
            : "over-governed",
      };
    });
    const misrouted = cases.filter((entry) => !entry.matched);
    return {
      id: policy.id,
      label: policy.label ?? policy.id,
      thresholds: policy.thresholds,
      caseCount: cases.length,
      matchedCount: cases.length - misrouted.length,
      misrouteCount: misrouted.length,
      misrouteRate: misrouted.length / cases.length,
      underGovernedCount: misrouted.filter((entry) => entry.severity === "under-governed").length,
      overGovernedCount: misrouted.filter((entry) => entry.severity === "over-governed").length,
      cases,
    };
  });
  return {
    protocolVersion: experiment.protocolVersion ?? 1,
    dataset: experiment.dataset,
    caseCount: experiment.cases.length,
    policies,
    improvement: {
      from: policies[0].id,
      to: policies.at(-1).id,
      misrouteCountDelta: policies.at(-1).misrouteCount - policies[0].misrouteCount,
      misrouteRateDelta: policies.at(-1).misrouteRate - policies[0].misrouteRate,
    },
  };
}
