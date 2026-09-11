"""Typed, dependency-free data contracts shared by Python Agent components."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Mapping

Decision = Literal["auto-approve", "human-review", "block"]
ACTION_TYPES = {"click", "fill", "press", "waitFor"}


class AgentValidationError(ValueError):
    """Raised when an Agent plan or governance input is unsafe or malformed."""


@dataclass(frozen=True)
class RiskSignal:
    id: str
    label: str
    weight: float
    active: bool
    evidence: str | None = None

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "RiskSignal":
        if not isinstance(value, Mapping):
            raise AgentValidationError("Risk signal must be an object.")
        signal_id = value.get("id")
        label = value.get("label")
        weight = value.get("weight")
        active = value.get("active")
        if not isinstance(signal_id, str) or not signal_id:
            raise AgentValidationError("Risk signal id must be a non-empty string.")
        if not isinstance(label, str) or not label:
            raise AgentValidationError(f"Risk signal {signal_id} label is required.")
        if not isinstance(weight, (int, float)) or isinstance(weight, bool) or weight < 0:
            raise AgentValidationError(f"Risk signal {signal_id} weight must be non-negative.")
        if not isinstance(active, bool):
            raise AgentValidationError(f"Risk signal {signal_id} active must be boolean.")
        evidence = value.get("evidence")
        return cls(signal_id, label, float(weight), active, evidence if isinstance(evidence, str) else None)

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "id": self.id,
            "label": self.label,
            "weight": self.weight,
            "active": self.active,
        }
        if self.evidence is not None:
            result["evidence"] = self.evidence
        return result


@dataclass(frozen=True)
class RiskPolicy:
    auto_approve_below: float
    block_above: float
    signals: tuple[RiskSignal, ...]

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "RiskPolicy":
        if not isinstance(value, Mapping):
            raise AgentValidationError("Risk policy must be an object.")
        thresholds = value.get("thresholds")
        if not isinstance(thresholds, Mapping):
            raise AgentValidationError("Risk policy thresholds are required.")
        auto = thresholds.get("autoApproveBelow")
        block = thresholds.get("blockAbove")
        if not isinstance(auto, (int, float)) or isinstance(auto, bool) or auto < 0:
            raise AgentValidationError("autoApproveBelow must be a non-negative number.")
        if not isinstance(block, (int, float)) or isinstance(block, bool) or block < auto:
            raise AgentValidationError("blockAbove must be >= autoApproveBelow.")
        signals = value.get("signals")
        if not isinstance(signals, list):
            raise AgentValidationError("Risk policy signals must be an array.")
        return cls(float(auto), float(block), tuple(RiskSignal.from_dict(item) for item in signals))

    def to_dict(self) -> dict[str, Any]:
        return {
            "thresholds": {
                "autoApproveBelow": self.auto_approve_below,
                "blockAbove": self.block_above,
            },
            "signals": [signal.to_dict() for signal in self.signals],
        }


@dataclass(frozen=True)
class RiskAssessment:
    score: float
    decision: Decision
    thresholds: dict[str, float]
    active_signals: tuple[RiskSignal, ...]

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": self.score,
            "decision": self.decision,
            "thresholds": dict(self.thresholds),
            "activeSignals": [signal.to_dict() for signal in self.active_signals],
        }


@dataclass(frozen=True)
class AgentAction:
    type: str
    selector: str
    value: str | None = None
    key: str | None = None
    dialog: Literal["none", "accept", "dismiss"] | None = None
    timeout: int | None = None

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> "AgentAction":
        if not isinstance(value, Mapping):
            raise AgentValidationError("Agent action must be an object.")
        action_type = value.get("type")
        selector = value.get("selector")
        if action_type not in ACTION_TYPES:
            raise AgentValidationError(f"Unsupported action type: {action_type!r}.")
        if not isinstance(selector, str) or not selector:
            raise AgentValidationError("Agent action selector must be a non-empty string.")
        allowed: dict[str, set[str]] = {
            "click": {"type", "selector", "dialog", "timeout"},
            "fill": {"type", "selector", "value", "timeout"},
            "press": {"type", "selector", "key", "timeout"},
            "waitFor": {"type", "selector", "timeout"},
        }
        unknown = set(value) - allowed[action_type]
        if unknown:
            raise AgentValidationError(f"Unknown fields for {action_type}: {sorted(unknown)}.")
        dialog = value.get("dialog")
        if action_type == "click":
            if dialog is None:
                dialog = "none"
            if dialog not in {"none", "accept", "dismiss"}:
                raise AgentValidationError("Click dialog must be none, accept or dismiss.")
        raw_value = value.get("value")
        key = value.get("key")
        if action_type == "fill" and not isinstance(raw_value, str):
            raise AgentValidationError("Fill action value must be a string.")
        if action_type == "press" and not isinstance(key, str):
            raise AgentValidationError("Press action key must be a string.")
        timeout = value.get("timeout")
        if timeout is not None and (not isinstance(timeout, int) or isinstance(timeout, bool) or timeout <= 0):
            raise AgentValidationError("Action timeout must be a positive integer.")
        return cls(
            type=action_type,
            selector=selector,
            value=raw_value if isinstance(raw_value, str) else None,
            key=key if isinstance(key, str) else None,
            dialog=dialog if isinstance(dialog, str) else None,
            timeout=timeout,
        )

    def to_dict(self, omit_none_dialog: bool = True) -> dict[str, Any]:
        result: dict[str, Any] = {"type": self.type, "selector": self.selector}
        if self.type == "fill":
            result["value"] = self.value
        elif self.type == "press":
            result["key"] = self.key
        elif self.type == "click" and (not omit_none_dialog or self.dialog != "none"):
            result["dialog"] = self.dialog
        if self.timeout is not None:
            result["timeout"] = self.timeout
        return result


@dataclass(frozen=True)
class AgentPlan:
    task_id: str
    actions: tuple[AgentAction, ...]

    @classmethod
    def from_dict(cls, value: Mapping[str, Any], max_steps: int | None = None) -> "AgentPlan":
        if not isinstance(value, Mapping):
            raise AgentValidationError("Agent plan must be an object.")
        task_id = value.get("taskId", value.get("task_id"))
        actions = value.get("actions")
        if not isinstance(task_id, str) or not task_id:
            raise AgentValidationError("Agent plan taskId is required.")
        if not isinstance(actions, list):
            raise AgentValidationError("Agent plan actions must be an array.")
        if max_steps is not None and len(actions) > max_steps:
            raise AgentValidationError(f"Agent plan has {len(actions)} actions; maximum is {max_steps}.")
        return cls(task_id, tuple(AgentAction.from_dict(action) for action in actions))

    def to_dict(self) -> dict[str, Any]:
        return {"taskId": self.task_id, "actions": [action.to_dict() for action in self.actions]}
