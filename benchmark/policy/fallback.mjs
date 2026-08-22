import { EvaluationInputError } from "../evaluator/evaluate.mjs";

const riskDecisions = new Set(["auto-approve", "human-review", "block"]);
const failureTypes = new Set(["provider-unavailable", "timeout", "invalid-plan", "pricing-unavailable"]);

export function resolveFallbackPolicy({ riskDecision, failureType, hasApprovedStaticPlan = false }) {
  if (!riskDecisions.has(riskDecision)) {
    throw new EvaluationInputError("Fallback riskDecision is invalid.");
  }
  if (!failureTypes.has(failureType)) {
    throw new EvaluationInputError("Fallback failureType is invalid.");
  }

  if (riskDecision === "block") {
    return {
      action: "keep-blocked",
      executionAllowed: false,
      releaseStatus: "no-go",
      reason: "风险策略优先于模型可用性，已拦截任务不得因降级重新放行。",
    };
  }
  if (failureType === "invalid-plan") {
    return {
      action: "reject-plan",
      executionAllowed: false,
      releaseStatus: "no-go",
      reason: "结构化输出或白名单校验失败，禁止浏览器执行。",
    };
  }
  if (failureType === "pricing-unavailable") {
    return {
      action: "hold-release",
      executionAllowed: true,
      releaseStatus: "insufficient-data",
      reason: "允许保留评测运行，但定价缺失时不能形成 GO 发布结论。",
    };
  }
  if (riskDecision === "auto-approve" && hasApprovedStaticPlan) {
    return {
      action: "use-versioned-static-plan",
      executionAllowed: true,
      releaseStatus: "insufficient-data",
      reason: "仅低风险任务可切换到已版本化并通过回归的静态计划。",
    };
  }
  return {
    action: "manual-queue",
    executionAllowed: false,
    releaseStatus: "insufficient-data",
    reason: "模型不可用且不存在批准的确定性计划，转人工处理并保留审计记录。",
  };
}
