import assert from "node:assert/strict";
import test from "node:test";
import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { summarizeAgentMetrics, validateSuite } from "./batch.mjs";

test("validates a batch suite manifest", () => {
  const suite = {
    id: "creator-smoke",
    cases: [{ task: "../tasks/task.json", plan: "../plans/plan.json" }],
  };
  assert.equal(validateSuite(suite), suite);
});

test("rejects malformed batch suite cases", () => {
  assert.throws(
    () => validateSuite({ id: "suite", cases: [] }),
    (error) => error instanceof EvaluationInputError && /non-empty array/.test(error.message),
  );
  assert.throws(
    () => validateSuite({ id: "suite", cases: [{ task: "task.json" }] }),
    (error) => error instanceof EvaluationInputError && /either plan or agentCommand/.test(error.message),
  );
});

test("aggregates token, cost, and latency metrics across agent cases", () => {
  const summary = summarizeAgentMetrics([
    {
      agent: {
        model: "gpt-4.1-mini",
        latencyMs: 200,
        usage: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 30, totalTokens: 130 },
        cost: { estimatedUsd: 0.00008 },
      },
    },
    {
      agent: {
        model: "gpt-4.1-mini",
        latencyMs: 400,
        usage: { inputTokens: 120, cachedInputTokens: 0, outputTokens: 40, totalTokens: 160 },
        cost: { estimatedUsd: 0.000112 },
      },
    },
  ]);

  assert.deepEqual(summary, {
    calls: 2,
    models: ["gpt-4.1-mini"],
    inputTokens: 220,
    cachedInputTokens: 20,
    outputTokens: 70,
    totalTokens: 290,
    averageLatencyMs: 300,
    estimatedCostUsd: 0.000192,
    pricedCalls: 2,
  });
});
