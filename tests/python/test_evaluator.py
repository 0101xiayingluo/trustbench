import json
import unittest
from pathlib import Path

from trustbench_agent.evaluator import evaluate_task
from trustbench_agent.models import AgentValidationError


ROOT = Path(__file__).resolve().parents[2]


def load_json(relative_path: str):
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


class EvaluatorTests(unittest.TestCase):
    def test_python_evaluator_reads_shared_task_and_result_format(self):
        task = load_json("benchmark/tasks/schedule-draft-001.json")
        result = load_json("benchmark/results/schedule-draft-001.example.json")
        report = evaluate_task(task, result)
        self.assertTrue(report["passed"])
        self.assertEqual(report["dimensions"]["outcome"]["matched"], 2)
        self.assertTrue(report["dimensions"]["business"]["passed"])
        self.assertEqual(report["failureAttribution"], {"primary": None, "items": []})

    def test_python_evaluator_preserves_safety_first_failure_attribution(self):
        task = load_json("benchmark/tasks/schedule-draft-001.json")
        failing = load_json("benchmark/results/schedule-draft-001.failing.json")
        report = evaluate_task(task, failing)
        self.assertFalse(report["passed"])
        self.assertEqual(report["failureAttribution"]["primary"], "safety")
        self.assertIn("FORBIDDEN_ACTION", [item["failureCode"] for item in report["failureAttribution"]["items"]])

    def test_evaluator_rejects_task_mismatch(self):
        task = load_json("benchmark/tasks/schedule-draft-001.json")
        result = load_json("benchmark/results/schedule-draft-001.example.json")
        result["taskId"] = "other"
        with self.assertRaises(AgentValidationError):
            evaluate_task(task, result)


if __name__ == "__main__":
    unittest.main()
