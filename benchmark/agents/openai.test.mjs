import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlanSchema,
  createOpenAIPlan,
  estimateCost,
  normalizeUsage,
  resolvePricing,
} from "./openai.mjs";

const task = {
  id: "creator.schedule-draft-001",
  instruction: "Schedule draft-001 without deleting content.",
  expectedState: { draftStatuses: { "draft-001": "scheduled" } },
  forbiddenActions: ["delete-draft"],
  maxSteps: 5,
  agentContext: {
    controls: [
      { type: "click", selector: "[data-testid=\"schedule-draft-001\"]" },
    ],
  },
};

test("creates a structured OpenAI action plan and captures model metrics", async () => {
  const calls = [];
  const plan = await createOpenAIPlan({
    task,
    apiKey: "test-key",
    env: {},
    now: (() => {
      const values = [100, 346];
      return () => values.shift();
    })(),
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        id: "resp_test",
        model: "gpt-4.1-mini-2025-04-14",
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: JSON.stringify({
              taskId: task.id,
              actions: [{
                type: "click",
                selector: "[data-testid=\"schedule-draft-001\"]",
                dialog: "none",
              }],
            }),
          }],
        }],
        usage: {
          input_tokens: 1000,
          input_tokens_details: { cached_tokens: 200 },
          output_tokens: 500,
          output_tokens_details: { reasoning_tokens: 50 },
          total_tokens: 1500,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  assert.equal(calls[0].url, "https://api.openai.com/v1/responses");
  assert.equal(calls[0].options.headers.Authorization, "Bearer test-key");
  const request = JSON.parse(calls[0].options.body);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.schema.properties.actions.maxItems, 5);
  assert.deepEqual(plan.actions, [{
    type: "click",
    selector: "[data-testid=\"schedule-draft-001\"]",
  }]);
  assert.equal(plan.agent.latencyMs, 246);
  assert.equal(plan.agent.usage.totalTokens, 1500);
  assert.equal(plan.agent.cost.estimatedUsd, 0.00114);
  assert.equal(plan.agent.cost.pricingSource, "builtin");
});

test("supports explicit pricing and marks unknown model pricing unavailable", () => {
  const usage = normalizeUsage({ input_tokens: 100, output_tokens: 20 });
  const pricing = resolvePricing("custom-model", {
    OPENAI_INPUT_COST_PER_1M: "2",
    OPENAI_CACHED_INPUT_COST_PER_1M: "0.5",
    OPENAI_OUTPUT_COST_PER_1M: "8",
  });
  assert.equal(estimateCost(usage, pricing).estimatedUsd, 0.00036);
  assert.equal(resolvePricing("custom-model", {}), null);
  assert.equal(estimateCost(usage, null).estimatedUsd, null);
});

test("rejects missing credentials before making a request", async () => {
  await assert.rejects(
    createOpenAIPlan({ task, apiKey: "", fetchImpl: async () => assert.fail("fetch should not run") }),
    /OPENAI_API_KEY is required/,
  );
});

test("builds a strict schema capped by the task step limit", () => {
  const schema = buildPlanSchema(3);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.actions.maxItems, 3);
  assert.deepEqual(schema.required, ["taskId", "actions"]);
});
