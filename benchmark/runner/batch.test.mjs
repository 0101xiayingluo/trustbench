import assert from "node:assert/strict";
import test from "node:test";
import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { validateSuite } from "./batch.mjs";

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
