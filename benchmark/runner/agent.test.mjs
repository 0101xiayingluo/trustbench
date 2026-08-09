import assert from "node:assert/strict";
import test from "node:test";
import { AgentCommandError, parseAgentPlanOutput } from "./agent.mjs";

test("parses the final JSON plan after agent diagnostics", () => {
  assert.deepEqual(parseAgentPlanOutput('agent log\n{"actions":[]}'), { actions: [] });
  assert.deepEqual(parseAgentPlanOutput('{\n  "actions": []\n}'), { actions: [] });
});

test("rejects agent output without a JSON object", () => {
  assert.throws(
    () => parseAgentPlanOutput("agent failed"),
    (error) => error instanceof AgentCommandError && /did not return/.test(error.message),
  );
});
