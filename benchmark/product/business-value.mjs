import { EvaluationInputError } from "../evaluator/evaluate.mjs";

function requireRate(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new EvaluationInputError(`${label} must be between 0 and 1.`);
  }
}

function requireNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new EvaluationInputError(`${label} must be a non-negative number.`);
  }
}

export function calculateBusinessValue(input) {
  for (const [key, value] of Object.entries({
    monthlyActions: input.monthlyActions,
    averageIncidentLoss: input.averageIncidentLoss,
    reviewMinutes: input.reviewMinutes,
    reviewerHourlyCost: input.reviewerHourlyCost,
    monthlyMaintenanceHours: input.monthlyMaintenanceHours,
    strategyHourlyCost: input.strategyHourlyCost,
    modelCostPerAction: input.modelCostPerAction,
  })) requireNonNegative(value, key);
  for (const [key, value] of Object.entries({
    highRiskShare: input.highRiskShare,
    baselineIncidentRate: input.baselineIncidentRate,
    preventionRate: input.preventionRate,
    baselineReviewRate: input.baselineReviewRate,
    governedReviewRate: input.governedReviewRate,
  })) requireRate(value, key);
  if (input.governedReviewRate > input.baselineReviewRate) {
    throw new EvaluationInputError("governedReviewRate cannot exceed baselineReviewRate.");
  }

  const highRiskActions = input.monthlyActions * input.highRiskShare;
  const baselineExpectedLoss = highRiskActions * input.baselineIncidentRate * input.averageIncidentLoss;
  const expectedAvoidedLoss = baselineExpectedLoss * input.preventionRate;
  const avoidedReviews = input.monthlyActions * (input.baselineReviewRate - input.governedReviewRate);
  const reviewHoursSaved = avoidedReviews * input.reviewMinutes / 60;
  const reviewCostSaved = reviewHoursSaved * input.reviewerHourlyCost;
  const maintenanceCost = input.monthlyMaintenanceHours * input.strategyHourlyCost;
  const modelCost = input.monthlyActions * input.modelCostPerAction;
  const estimatedNetValue = expectedAvoidedLoss + reviewCostSaved - maintenanceCost - modelCost;

  return {
    currency: input.currency ?? "CNY",
    assumptions: { ...input },
    metrics: {
      highRiskActions,
      baselineExpectedLoss,
      expectedAvoidedLoss,
      avoidedReviews,
      reviewHoursSaved,
      reviewCostSaved,
      maintenanceCost,
      modelCost,
      estimatedNetValue,
    },
    disclaimer: "情景测算结果，由显式假设推导，不代表已上线收益或真实资损。",
  };
}
