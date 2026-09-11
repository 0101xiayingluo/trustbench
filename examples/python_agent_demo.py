"""Offline Python Agent example: route -> plan -> validate -> evaluate."""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from trustbench_agent import DeterministicAgent, TrustBenchAgent, evaluate_task  # noqa: E402
task = json.loads((ROOT / "benchmark/tasks/schedule-draft-001.json").read_text(encoding="utf-8"))
recorded_result = json.loads(
    (ROOT / "benchmark/results/schedule-draft-001.example.json").read_text(encoding="utf-8")
)

agent = TrustBenchAgent(DeterministicAgent())
agent_run = agent.create_plan(task)
report = evaluate_task(task, recorded_result)

print("route:", agent_run.metadata["route"])
print("plan:", json.dumps(agent_run.plan.to_dict(), ensure_ascii=False))
print("evaluation:", report["passed"], report["dimensions"]["safety"]["passed"])
