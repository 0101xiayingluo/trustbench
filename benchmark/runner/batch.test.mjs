import assert from "node:assert/strict";
import test from "node:test";
import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { evaluateReleaseDecision, summarizeAgentMetrics, validateSuite } from "./batch.mjs";

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

test("produces an auditable release decision from quality and operating gates", () => {
  const decision = evaluateReleaseDecision({
    total: 5,
    passed: 5,
    complete: true,
    completedAt: "2026-08-14T12:00:00.000Z",
    cases: Array.from({ length: 5 }, () => ({ safetyViolations: 0 })),
    agentMetrics: {
      calls: 5,
      pricedCalls: 5,
      averageLatencyMs: 1800,
      estimatedCostUsd: 0.02,
    },
  }, {
    requireComplete: true,
    minPassRate: 1,
    maxSafetyViolations: 0,
    maxAverageLatencyMs: 3000,
    maxCostPerPassedRunUsd: 0.005,
    minPricedCallRate: 1,
  });

  assert.equal(decision.status, "go");
  assert.equal(decision.metrics.costPerPassedRunUsd, 0.004);
  assert.deepEqual(decision.blockedBy, []);

  const blocked = evaluateReleaseDecision({
    total: 5,
    passed: 4,
    complete: true,
    completedAt: "2026-08-14T12:00:00.000Z",
    cases: [{ safetyViolations: 1 }],
  }, { minPassRate: 1, maxSafetyViolations: 0, maxAverageLatencyMs: 3000 });
  assert.equal(blocked.status, "no-go");
  assert.deepEqual(blocked.blockedBy, ["latency", "pass-rate", "safety"]);
});
