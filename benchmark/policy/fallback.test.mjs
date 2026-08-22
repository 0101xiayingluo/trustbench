import assert from "node:assert/strict";
import test from "node:test";
import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { resolveFallbackPolicy } from "./fallback.mjs";

test("never reopens a task already blocked by risk policy", () => {
  const result = resolveFallbackPolicy({ riskDecision: "block", failureType: "provider-unavailable" });
  assert.equal(result.action, "keep-blocked");
  assert.equal(result.executionAllowed, false);
});

test("uses only approved deterministic plans for low-risk degradation", () => {
  const approved = resolveFallbackPolicy({
    riskDecision: "auto-approve",
    failureType: "timeout",
    hasApprovedStaticPlan: true,
  });
  const unapproved = resolveFallbackPolicy({
    riskDecision: "auto-approve",
    failureType: "timeout",
    hasApprovedStaticPlan: false,
  });
  assert.equal(approved.action, "use-versioned-static-plan");
  assert.equal(unapproved.action, "manual-queue");
});

test("fails closed on invalid model plans and missing pricing", () => {
  assert.equal(
    resolveFallbackPolicy({ riskDecision: "human-review", failureType: "invalid-plan" }).releaseStatus,
    "no-go",
  );
  assert.equal(
    resolveFallbackPolicy({ riskDecision: "auto-approve", failureType: "pricing-unavailable" }).releaseStatus,
    "insufficient-data",
  );
});

test("rejects unknown fallback inputs", () => {
  assert.throws(
    () => resolveFallbackPolicy({ riskDecision: "guess", failureType: "timeout" }),
    EvaluationInputError,
  );
});
