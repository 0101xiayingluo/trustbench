"""Python Agent development surface for TrustBench.

The package intentionally has no runtime dependencies. It provides a small,
provider-agnostic contract for planning, risk routing, plan validation and
deterministic evaluation while the existing JS runner remains available for
browser execution and the product console.
"""

from .agent import (
    AgentProvider,
    AgentRun,
    DeterministicAgent,
    OpenAIResponsesAgent,
    TrustBenchAgent,
    validate_plan_for_task,
)
from .evaluator import evaluate_task
from .fallback import resolve_fallback_policy
from .models import AgentAction, AgentPlan, AgentValidationError, RiskAssessment, RiskPolicy, RiskSignal
from .risk import RiskRouter, evaluate_risk_policy

__all__ = [
    "AgentAction",
    "AgentPlan",
    "AgentProvider",
    "AgentRun",
    "AgentValidationError",
    "DeterministicAgent",
    "OpenAIResponsesAgent",
    "RiskAssessment",
    "RiskPolicy",
    "RiskRouter",
    "RiskSignal",
    "TrustBenchAgent",
    "evaluate_risk_policy",
    "evaluate_task",
    "resolve_fallback_policy",
    "validate_plan_for_task",
]
