"""Command line entry point for Python Agent development."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .agent import DeterministicAgent, TrustBenchAgent
from .evaluator import evaluate_task
from .models import AgentValidationError
from .risk import RiskRouter


def _load(path: str) -> Any:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _dump(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="trustbench-agent", description="TrustBench Python Agent SDK CLI")
    subparsers = parser.add_subparsers(dest="command", required=True)

    route_parser = subparsers.add_parser("route", help="计算任务风险路由")
    route_parser.add_argument("--task", required=True)

    plan_parser = subparsers.add_parser("plan", help="用离线 fixture 生成并校验结构化计划")
    plan_parser.add_argument("--task", required=True)

    evaluate_parser = subparsers.add_parser("evaluate", help="用 Python 四维评测器评测运行结果")
    evaluate_parser.add_argument("--task", required=True)
    evaluate_parser.add_argument("--result", required=True)

    args = parser.parse_args(argv)
    try:
        task = _load(args.task)
        if args.command == "route":
            _dump(RiskRouter().route(task))
        elif args.command == "plan":
            _dump(TrustBenchAgent(DeterministicAgent()).create_plan(task).to_dict())
        else:
            _dump(evaluate_task(task, _load(args.result)))
        return 0
    except (OSError, json.JSONDecodeError, AgentValidationError) as error:
        print(json.dumps({"error": str(error)}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
