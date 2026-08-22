import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { evaluateRiskPolicy } from "./risk.mjs";

const decisionRank = new Map([
  ["auto-approve", 0],
  ["human-review", 1],
  ["block", 2],
]);

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function validatePolicies(policies) {
  if (!Array.isArray(policies) || policies.length < 2) {
    throw new EvaluationInputError("Pareto analysis requires at least two policies.");
  }
  for (const [index, policy] of policies.entries()) {
    if (typeof policy?.id !== "string" || !policy.id) {
      throw new EvaluationInputError(`Pareto policy at index ${index} must provide id.`);
    }
    if (!Number.isFinite(policy.thresholds?.autoApproveBelow)
      || !Number.isFinite(policy.thresholds?.blockAbove)) {
      throw new EvaluationInputError(`Pareto policy ${policy.id} thresholds are invalid.`);
    }
  }
}

function dominates(candidate, target) {
  const dimensions = ["underGovernedRate", "interventionRate", "falseBlockRate"];
  const noWorse = dimensions.every((key) => candidate.metrics[key] <= target.metrics[key]);
  const strictlyBetter = dimensions.some((key) => candidate.metrics[key] < target.metrics[key]);
  return noWorse && strictlyBetter;
}

export function evaluatePolicyTradeoffs({ cases, policies }) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new EvaluationInputError("Pareto analysis requires a non-empty case set.");
  }
  validatePolicies(policies);

  const evaluated = policies.map((policy) => {
    const predictions = cases.map((entry) => {
      if (!decisionRank.has(entry.goldDecision) || !Number.isFinite(entry.score)) {
        throw new EvaluationInputError(`Pareto case ${entry.id ?? "unknown"} is invalid.`);
      }
      const predictedDecision = evaluateRiskPolicy({
        thresholds: policy.thresholds,
        signals: [{ id: "score", label: "风险分", weight: entry.score, active: true }],
      }).decision;
      const difference = decisionRank.get(predictedDecision) - decisionRank.get(entry.goldDecision);
      return {
        id: entry.id,
        score: entry.score,
        goldDecision: entry.goldDecision,
        predictedDecision,
        outcome: difference === 0 ? "matched" : difference < 0 ? "under-governed" : "over-governed",
      };
    });

    const dangerous = predictions.filter((entry) => entry.goldDecision === "block");
    const legitimate = predictions.filter((entry) => entry.goldDecision !== "block");
    const underGoverned = predictions.filter((entry) => entry.outcome === "under-governed");
    const overGoverned = predictions.filter((entry) => entry.outcome === "over-governed");
    const interventions = predictions.filter((entry) => entry.predictedDecision !== "auto-approve");
    const humanReviews = predictions.filter((entry) => entry.predictedDecision === "human-review");
    const falseBlocks = legitimate.filter((entry) => entry.predictedDecision === "block");
    const blockedDangerous = dangerous.filter((entry) => entry.predictedDecision === "block");

    return {
      id: policy.id,
      label: policy.label ?? policy.id,
      thresholds: policy.thresholds,
      metrics: {
        exactMatchRate: ratio(predictions.length - underGoverned.length - overGoverned.length, predictions.length),
        underGovernedRate: ratio(underGoverned.length, predictions.length),
        overGovernedRate: ratio(overGoverned.length, predictions.length),
        interventionRate: ratio(interventions.length, predictions.length),
        humanReviewRate: ratio(humanReviews.length, predictions.length),
        dangerousBlockRecall: ratio(blockedDangerous.length, dangerous.length),
        falseBlockRate: ratio(falseBlocks.length, legitimate.length),
      },
      counts: {
        cases: predictions.length,
        underGoverned: underGoverned.length,
        overGoverned: overGoverned.length,
        interventions: interventions.length,
        humanReviews: humanReviews.length,
        dangerous: dangerous.length,
        blockedDangerous: blockedDangerous.length,
        falseBlocks: falseBlocks.length,
      },
      predictions,
    };
  });

  const policiesWithFrontier = evaluated.map((policy) => ({
    ...policy,
    paretoOptimal: !evaluated.some((candidate) => candidate.id !== policy.id && dominates(candidate, policy)),
  }));

  return {
    protocolVersion: 1,
    caseCount: cases.length,
    objectives: ["minimize-under-governed", "minimize-intervention", "minimize-false-block"],
    policies: policiesWithFrontier,
    paretoPolicyIds: policiesWithFrontier.filter((policy) => policy.paretoOptimal).map((policy) => policy.id),
  };
}
