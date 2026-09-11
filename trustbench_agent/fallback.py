"""Fail-closed provider degradation rules for local Agent development."""

from __future__ import annotations

from typing import Any

from .models import AgentValidationError

_DECISIONS = {"auto-approve", "human-review", "block"}
_FAILURES = {"provider-unavailable", "timeout", "invalid-plan", "pricing-unavailable"}


def resolve_fallback_policy(
    risk_decision: str,
    failure_type: str,
    has_approved_static_plan: bool = False,
) -> dict[str, Any]:
    if risk_decision not in _DECISIONS:
        raise AgentValidationError("Fallback risk_decision is invalid.")
    if failure_type not in _FAILURES:
        raise AgentValidationError("Fallback failure_type is invalid.")
    if risk_decision == "block":
        return {
            "action": "keep-blocked",
            "execution_allowed": False,
            "release_status": "no-go",
            "reason": "风险策略优先于模型可用性，已拦截任务不得因降级重新放行。",
        }
    if failure_type == "invalid-plan":
        return {
            "action": "reject-plan",
            "execution_allowed": False,
            "release_status": "no-go",
            "reason": "结构化输出或白名单校验失败，禁止浏览器执行。",
        }
    if failure_type == "pricing-unavailable":
        return {
            "action": "hold-release",
            "execution_allowed": True,
            "release_status": "insufficient-data",
            "reason": "允许保留评测运行，但定价缺失时不能形成 GO 发布结论。",
        }
    if risk_decision == "auto-approve" and has_approved_static_plan:
        return {
            "action": "use-versioned-static-plan",
            "execution_allowed": True,
            "release_status": "insufficient-data",
            "reason": "仅低风险任务可切换到已版本化并通过回归的静态计划。",
        }
    return {
        "action": "manual-queue",
        "execution_allowed": False,
        "release_status": "insufficient-data",
        "reason": "模型不可用且不存在批准的确定性计划，转人工处理并保留审计记录。",
    }
