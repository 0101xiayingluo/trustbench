"""Explainable scorecard routing shared by Agent providers."""

from __future__ import annotations

from typing import Any, Mapping

from .models import AgentValidationError, RiskAssessment, RiskPolicy


def evaluate_risk_policy(policy: RiskPolicy | Mapping[str, Any]) -> RiskAssessment:
    resolved = policy if isinstance(policy, RiskPolicy) else RiskPolicy.from_dict(policy)
    raw_score = sum(signal.weight for signal in resolved.signals if signal.active)
    score = min(100.0, raw_score)
    if score < resolved.auto_approve_below:
        decision = "auto-approve"
    elif score > resolved.block_above:
        decision = "block"
    else:
        decision = "human-review"
    return RiskAssessment(
        score=score,
        decision=decision,
        thresholds={
            "autoApproveBelow": resolved.auto_approve_below,
            "blockAbove": resolved.block_above,
        },
        active_signals=tuple(signal for signal in resolved.signals if signal.active),
    )


class RiskRouter:
    """Select a provider profile without allowing the model to widen permissions."""

    def __init__(self, base_model: str = "gpt-4.1-mini", reasoning_model: str | None = None):
        self.base_model = base_model
        self.reasoning_model = reasoning_model

    def route(self, task: Mapping[str, Any]) -> dict[str, Any]:
        if not isinstance(task, Mapping):
            raise AgentValidationError("A task object is required for routing.")
        assessment = None
        if task.get("riskPolicy") is not None:
            assessment = evaluate_risk_policy(task["riskPolicy"])
        # An explicit scorecard is authoritative. The legacy riskLevel is only
        # used for tasks that have not migrated to riskPolicy yet.
        high_risk = assessment.decision == "human-review" if assessment else task.get("riskLevel") == "high"
        required_approvals = task.get("requiredApprovals") or []
        human_required = bool((assessment and assessment.decision == "human-review") or required_approvals)
        if assessment and assessment.decision == "block":
            route = "policy-blocked"
            model = self.reasoning_model or self.base_model
            effort = None
            human_required = False
        elif high_risk and self.reasoning_model:
            route = "high-risk-reasoning"
            model = self.reasoning_model
            effort = "high"
        else:
            route = "high-risk-governed" if high_risk else "balanced"
            model = self.base_model
            effort = None
        return {
            "model": model,
            "route": route,
            "reasoning_effort": effort,
            "human_approval_required": human_required,
            "risk_score": assessment.score if assessment else None,
            "risk_decision": assessment.decision if assessment else ("human-review" if high_risk else "auto-approve"),
        }
