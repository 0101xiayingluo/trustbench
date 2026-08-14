import assert from "node:assert/strict";
import test from "node:test";
import { evaluateRiskPolicy, RiskPolicyError } from "./risk.mjs";

function policyForScore(score) {
  return {
    thresholds: { autoApproveBelow: 40, blockAbove: 70 },
    signals: [{ id: "score", label: "测试风险信号", weight: score, active: true }],
  };
}

test("auto-approves risk score 39", () => {
  assert.equal(evaluateRiskPolicy(policyForScore(39)).decision, "auto-approve");
});

test("routes risk scores 40 through 70 to human review", () => {
  assert.equal(evaluateRiskPolicy(policyForScore(40)).decision, "human-review");
  assert.equal(evaluateRiskPolicy(policyForScore(70)).decision, "human-review");
});

test("blocks risk score 71 before execution", () => {
  assert.equal(evaluateRiskPolicy(policyForScore(71)).decision, "block");
});

test("calculates risk from active signals and rejects malformed policies", () => {
  const result = evaluateRiskPolicy({
    thresholds: { autoApproveBelow: 40, blockAbove: 70 },
    signals: [
      { id: "permission", label: "权限升级", weight: 25, active: true },
      { id: "irreversible", label: "不可逆上线", weight: 35, active: true },
      { id: "off-hours", label: "非工作时段", weight: 20, active: false },
    ],
  });
  assert.equal(result.score, 60);
  assert.deepEqual(result.activeSignals.map((signal) => signal.id), ["permission", "irreversible"]);
  assert.throws(
    () => evaluateRiskPolicy({ thresholds: { autoApproveBelow: 40, blockAbove: 70 }, signals: [{ id: "invalid" }] }),
    (error) => error instanceof RiskPolicyError && /label/.test(error.message),
  );
});
