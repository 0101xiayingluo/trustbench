import json
import unittest
from pathlib import Path

from trustbench_agent import (
    AgentAction,
    AgentPlan,
    DeterministicAgent,
    OpenAIResponsesAgent,
    RiskRouter,
    TrustBenchAgent,
    validate_plan_for_task,
)
from trustbench_agent.fallback import resolve_fallback_policy
from trustbench_agent.models import AgentValidationError


ROOT = Path(__file__).resolve().parents[2]


def load_json(relative_path: str):
    return json.loads((ROOT / relative_path).read_text(encoding="utf-8"))


class AgentSdkTests(unittest.TestCase):
    def test_risk_router_matches_governance_bands(self):
        task = load_json("benchmark/tasks/launch-campaign-001.json")
        route = RiskRouter(reasoning_model="reasoning-model").route(task)
        self.assertEqual(route["route"], "high-risk-reasoning")
        self.assertEqual(route["risk_score"], 60.0)
        self.assertEqual(route["risk_decision"], "human-review")
        self.assertTrue(route["human_approval_required"])

        blocked = dict(task)
        blocked["riskPolicy"] = dict(task["riskPolicy"])
        blocked["riskPolicy"]["signals"] = [dict(signal, active=True) for signal in task["riskPolicy"]["signals"]]
        blocked_route = RiskRouter().route(blocked)
        self.assertEqual(blocked_route["route"], "policy-blocked")
        self.assertEqual(blocked_route["risk_decision"], "block")
        self.assertFalse(blocked_route["human_approval_required"])

        low_score = dict(task)
        low_score["riskPolicy"] = dict(task["riskPolicy"])
        low_score["riskPolicy"]["signals"] = [dict(signal, active=False) for signal in task["riskPolicy"]["signals"]]
        low_score_route = RiskRouter(reasoning_model="reasoning-model").route(low_score)
        self.assertEqual(low_score_route["route"], "balanced")
        self.assertEqual(low_score_route["risk_decision"], "auto-approve")

    def test_fixture_agent_creates_valid_plan_for_existing_task(self):
        task = load_json("benchmark/tasks/schedule-draft-001.json")
        result = TrustBenchAgent(DeterministicAgent()).create_plan(task)
        self.assertEqual(result.plan.task_id, task["id"])
        self.assertEqual(result.plan.actions[0].type, "click")
        self.assertEqual(result.metadata["provider"], "deterministic-fixture")

    def test_plan_validation_rejects_unknown_or_forbidden_controls(self):
        task = load_json("benchmark/tasks/schedule-draft-001.json")
        plan = AgentPlan(task["id"], (AgentAction("click", '[data-testid="unknown"]', dialog="none"),))
        with self.assertRaises(AgentValidationError):
            validate_plan_for_task(task, plan)

        forbidden_task = dict(task)
        forbidden_task["forbiddenActions"] = ["delete-draft"]
        delete_plan = AgentPlan(task["id"], (AgentAction("click", '[data-testid="delete-draft-001"]', dialog="accept"),))
        with self.assertRaises(AgentValidationError):
            validate_plan_for_task(forbidden_task, delete_plan)

        cancelled_delete = AgentPlan(task["id"], (AgentAction("click", '[data-testid="delete-draft-001"]', dialog="dismiss"),))
        self.assertEqual(validate_plan_for_task(forbidden_task, cancelled_delete), cancelled_delete)

        wait_only = AgentPlan(task["id"], (AgentAction("waitFor", '[data-testid="delete-draft-001"]', timeout=1000),))
        self.assertEqual(validate_plan_for_task(forbidden_task, wait_only), wait_only)

        with self.assertRaises(AgentValidationError):
            AgentAction.from_dict({"type": "waitFor", "selector": "#ready", "timeout": 0})

    def test_openai_adapter_uses_strict_schema_without_network(self):
        task = load_json("benchmark/tasks/schedule-draft-001.json")
        captured = {}

        def fake_transport(url, headers, body, timeout):
            captured.update({"url": url, "headers": headers, "body": json.loads(body), "timeout": timeout})
            return {
                "id": "resp_test",
                "model": "gpt-4.1-mini",
                "output_text": json.dumps({
                    "taskId": task["id"],
                    "actions": [{"type": "click", "selector": '[data-testid="schedule-draft-001"]', "dialog": "none"}],
                }),
                "usage": {"input_tokens": 10, "output_tokens": 5, "total_tokens": 15},
            }

        route = RiskRouter().route(task)
        result = OpenAIResponsesAgent(api_key="test-key", transport=fake_transport).plan(task, route)
        self.assertEqual(result.plan.task_id, task["id"])
        self.assertEqual(result.metadata["provider"], "openai")
        self.assertEqual(captured["url"], "https://api.openai.com/v1/responses")
        self.assertEqual(captured["headers"]["Authorization"], "Bearer test-key")
        self.assertTrue(captured["body"]["text"]["format"]["strict"])
        self.assertEqual(captured["body"]["text"]["format"]["schema"]["properties"]["actions"]["maxItems"], 5)
        action_variants = captured["body"]["text"]["format"]["schema"]["properties"]["actions"]["items"]["anyOf"]
        self.assertEqual(len(action_variants), 4)
        self.assertEqual(result.metadata["usage"]["total_tokens"], 15)
        self.assertEqual(result.metadata["cost"]["pricing_source"], "builtin")
        self.assertAlmostEqual(result.metadata["cost"]["estimated_usd"], 0.000012)

    def test_fallback_is_fail_closed(self):
        blocked = resolve_fallback_policy("block", "timeout")
        self.assertEqual(blocked["action"], "keep-blocked")
        self.assertFalse(blocked["execution_allowed"])
        static = resolve_fallback_policy("auto-approve", "timeout", has_approved_static_plan=True)
        self.assertEqual(static["action"], "use-versioned-static-plan")
        invalid = resolve_fallback_policy("human-review", "invalid-plan")
        self.assertEqual(invalid["release_status"], "no-go")


if __name__ == "__main__":
    unittest.main()
