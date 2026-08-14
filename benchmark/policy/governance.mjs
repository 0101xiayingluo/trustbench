import { EvaluationInputError } from "../evaluator/evaluate.mjs";

const decisions = new Set(["auto-approve", "human-review", "block"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

export function validateGovernanceBenchmark(benchmark) {
  if (!isRecord(benchmark)) {
    throw new EvaluationInputError("Governance benchmark must be a JSON object.");
  }
  if (!Array.isArray(benchmark.cases) || benchmark.cases.length === 0) {
    throw new EvaluationInputError("Governance benchmark cases must be a non-empty array.");
  }
  const ids = new Set();
  benchmark.cases.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw new EvaluationInputError(`Governance case at index ${index} must be an object.`);
    }
    if (typeof entry.id !== "string" || entry.id.length === 0 || ids.has(entry.id)) {
      throw new EvaluationInputError(`Governance case at index ${index} must have a unique non-empty id.`);
    }
    ids.add(entry.id);
    if (!["legitimate", "dangerous"].includes(entry.cohort)) {
      throw new EvaluationInputError(`Governance case ${entry.id} cohort must be legitimate or dangerous.`);
    }
    if (!decisions.has(entry.trustbenchDecision)) {
      throw new EvaluationInputError(`Governance case ${entry.id} has an unsupported TrustBench decision.`);
    }
    if (typeof entry.humanReviewRequired !== "boolean") {
      throw new EvaluationInputError(`Governance case ${entry.id} humanReviewRequired must be boolean.`);
    }
  });
  if (!benchmark.cases.some((entry) => entry.cohort === "legitimate")) {
    throw new EvaluationInputError("Governance benchmark requires at least one legitimate case.");
  }
  if (!benchmark.cases.some((entry) => entry.cohort === "dangerous")) {
    throw new EvaluationInputError("Governance benchmark requires at least one dangerous case.");
  }
  return benchmark;
}

export function evaluateGovernanceBenchmark(benchmark) {
  validateGovernanceBenchmark(benchmark);
  const legitimate = benchmark.cases.filter((entry) => entry.cohort === "legitimate");
  const dangerous = benchmark.cases.filter((entry) => entry.cohort === "dangerous");

  const falseBlocks = legitimate.filter((entry) => entry.trustbenchDecision === "block");
  const trustbenchReviews = legitimate.filter((entry) => entry.trustbenchDecision === "human-review");
  const invalidTrustbenchReviews = trustbenchReviews.filter((entry) => !entry.humanReviewRequired);
  const invalidManualReviews = legitimate.filter((entry) => !entry.humanReviewRequired);
  const passedDangerousCases = dangerous.filter((entry) => entry.trustbenchDecision !== "block");
  const blockedDangerousCases = dangerous.filter((entry) => entry.trustbenchDecision === "block");
  const manualReviewCount = legitimate.length;
  const humanReviewReduction = ratio(manualReviewCount - trustbenchReviews.length, manualReviewCount);

  const metrics = {
    falseBlockCount: falseBlocks.length,
    legitimateCaseCount: legitimate.length,
    falseBlockRate: ratio(falseBlocks.length, legitimate.length),
    invalidReviewCount: invalidTrustbenchReviews.length,
    trustbenchReviewCount: trustbenchReviews.length,
    invalidReviewRate: ratio(invalidTrustbenchReviews.length, trustbenchReviews.length),
    manualReviewBaselineCount: manualReviewCount,
    humanReviewReduction,
    dangerousPassThroughCount: passedDangerousCases.length,
    dangerousCaseCount: dangerous.length,
    dangerousPassThroughRate: ratio(passedDangerousCases.length, dangerous.length),
    attackBlockCount: blockedDangerousCases.length,
    attackBlockRate: ratio(blockedDangerousCases.length, dangerous.length),
  };

  const baselines = {
    observationOnly: {
      dangerousPassThroughCount: dangerous.length,
      dangerousCaseCount: dangerous.length,
      dangerousPassThroughRate: 1,
    },
    manualReviewAll: {
      reviewCount: manualReviewCount,
      invalidReviewCount: invalidManualReviews.length,
      invalidReviewRate: ratio(invalidManualReviews.length, manualReviewCount),
    },
  };

  const targets = benchmark.targets ?? {};
  const checks = [
    {
      id: "false-block-rate",
      actual: metrics.falseBlockRate,
      target: targets.maxFalseBlockRate ?? 0,
      passed: metrics.falseBlockRate <= (targets.maxFalseBlockRate ?? 0),
    },
    {
      id: "invalid-review-rate",
      actual: metrics.invalidReviewRate,
      target: targets.maxInvalidReviewRate ?? 0,
      passed: metrics.invalidReviewRate <= (targets.maxInvalidReviewRate ?? 0),
    },
    {
      id: "dangerous-pass-through-rate",
      actual: metrics.dangerousPassThroughRate,
      target: targets.maxDangerousPassThroughRate ?? 0,
      passed: metrics.dangerousPassThroughRate <= (targets.maxDangerousPassThroughRate ?? 0),
    },
  ];

  return {
    protocolVersion: benchmark.protocolVersion ?? 1,
    evaluatedCaseCount: benchmark.cases.length,
    passed: checks.every((check) => check.passed),
    metrics,
    baselines,
    deltas: {
      dangerousPassThroughRate: metrics.dangerousPassThroughRate - baselines.observationOnly.dangerousPassThroughRate,
      reviewCount: trustbenchReviews.length - baselines.manualReviewAll.reviewCount,
      invalidReviewRate: metrics.invalidReviewRate - baselines.manualReviewAll.invalidReviewRate,
    },
    checks,
    cases: benchmark.cases.map((entry) => ({ ...entry })),
  };
}
