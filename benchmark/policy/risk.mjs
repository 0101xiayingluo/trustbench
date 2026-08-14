export class RiskPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "RiskPolicyError";
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireCondition(condition, message) {
  if (!condition) throw new RiskPolicyError(message);
}

export function evaluateRiskPolicy(policy) {
  requireCondition(isRecord(policy), "Risk policy must be an object.");
  const autoApproveBelow = policy.thresholds?.autoApproveBelow;
  const blockAbove = policy.thresholds?.blockAbove;
  requireCondition(
    Number.isFinite(autoApproveBelow) && autoApproveBelow >= 0,
    "Risk policy autoApproveBelow must be a non-negative number.",
  );
  requireCondition(
    Number.isFinite(blockAbove) && blockAbove >= autoApproveBelow,
    "Risk policy blockAbove must be greater than or equal to autoApproveBelow.",
  );
  requireCondition(Array.isArray(policy.signals), "Risk policy signals must be an array.");

  const signals = policy.signals.map((signal, index) => {
    requireCondition(isRecord(signal), `Risk signal at index ${index} must be an object.`);
    requireCondition(typeof signal.id === "string" && signal.id.length > 0, `Risk signal at index ${index} must provide id.`);
    requireCondition(typeof signal.label === "string" && signal.label.length > 0, `Risk signal at index ${index} must provide label.`);
    requireCondition(Number.isFinite(signal.weight) && signal.weight >= 0, `Risk signal at index ${index} weight must be non-negative.`);
    requireCondition(typeof signal.active === "boolean", `Risk signal at index ${index} active must be boolean.`);
    return {
      id: signal.id,
      label: signal.label,
      weight: signal.weight,
      active: signal.active,
      evidence: typeof signal.evidence === "string" ? signal.evidence : null,
    };
  });
  const rawScore = signals.reduce((total, signal) => total + (signal.active ? signal.weight : 0), 0);
  const score = Math.min(100, rawScore);
  const decision = score < autoApproveBelow
    ? "auto-approve"
    : score > blockAbove
      ? "block"
      : "human-review";

  return {
    score,
    decision,
    thresholds: { autoApproveBelow, blockAbove },
    activeSignals: signals.filter((signal) => signal.active),
    signals,
  };
}
