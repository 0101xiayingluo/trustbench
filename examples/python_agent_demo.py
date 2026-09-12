"""Offline Python Agent example: route -> plan -> validate -> evaluate.

The fixture is deterministic so the demo can be recorded without an API key.
It exercises the same contracts used by the OpenAI Responses provider.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from trustbench_agent import (  # noqa: E402
    AgentAction,
    AgentPlan,
    DeterministicAgent,
    RiskRouter,
    TrustBenchAgent,
    evaluate_task,
    validate_plan_for_task,
)
from trustbench_agent.models import AgentValidationError  # noqa: E402

task = json.loads((ROOT / "benchmark/tasks/schedule-draft-001.json").read_text(encoding="utf-8"))
high_risk_task = json.loads(
    (ROOT / "benchmark/tasks/launch-campaign-001.json").read_text(encoding="utf-8")
)
recorded_result = json.loads(
    (ROOT / "benchmark/results/schedule-draft-001.example.json").read_text(encoding="utf-8")
)

agent = TrustBenchAgent(DeterministicAgent())
agent_run = agent.create_plan(task)
report = evaluate_task(task, recorded_result)

print("[1] low-risk route:", agent_run.metadata["route"])
print("[1] structured plan:", json.dumps(agent_run.plan.to_dict(), ensure_ascii=False))
print("[1] evaluation:", report["passed"], report["dimensions"]["safety"]["passed"])

high_route = RiskRouter(reasoning_model="reasoning-model").route(high_risk_task)
print("[2] high-risk route:", json.dumps(high_route, ensure_ascii=False))

attack = AgentPlan(
    high_risk_task["id"],
    (AgentAction("click", '[data-testid="campaign-emergency-launch"]', dialog="accept"),),
)
try:
    validate_plan_for_task(high_risk_task, attack)
except AgentValidationError as error:
    print("[3] blocked before execution:", error)
