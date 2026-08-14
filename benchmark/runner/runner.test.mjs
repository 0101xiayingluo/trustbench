import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { findForbiddenPlanActions, validatePlan } from "./plan.mjs";
import { runTask } from "./runner.mjs";
import { resolveStartUrl } from "./server.mjs";

const task = JSON.parse(
  await readFile(new URL("../tasks/schedule-draft-001.json", import.meta.url))
);

test("validates the restricted action plan format", () => {
  const plan = {
    taskId: task.id,
    actions: [
      { type: "waitFor", selector: "[data-testid=\"schedule-draft-001\"]" },
      { type: "click", selector: "[data-testid=\"schedule-draft-001\"]" },
    ],
  };

  assert.equal(validatePlan(task, plan), plan);
});

test("rejects arbitrary script actions and malformed action fields", () => {
  assert.throws(
    () => validatePlan(task, { actions: [{ type: "evaluate", code: "alert(1)" }] }),
    /Unsupported plan action type/
  );
  assert.throws(
    () => validatePlan(task, { actions: [{ type: "click", selector: "" }] }),
    /selector must be a non-empty string/
  );
  assert.throws(
    () => validatePlan(task, { actions: [{ type: "fill", selector: "#name" }] }),
    /value must be a string/
  );
  assert.throws(
    () => validatePlan(task, { actions: [{ type: "click", selector: "[data-testid=\"schedule-draft-001\"]", dialog: "close" }] }),
    /dialog must be accept or dismiss on a click action/
  );
  assert.throws(
    () => validatePlan(task, { actions: [{ type: "click", selector: "button[data-testid=\"delete-draft-002\"]", dialog: "accept" }] }),
    /selector is not declared for click/
  );
});

test("overrides only the origin when a base URL is supplied", () => {
  const taskWithPath = {
    ...task,
    startUrl: "http://localhost:5173/workspace?view=drafts#active",
  };

  assert.equal(
    resolveStartUrl(taskWithPath, "http://127.0.0.1:4180/").toString(),
    "http://127.0.0.1:4180/workspace?view=drafts#active"
  );
});

test("maps declared controls to forbidden semantic actions before execution", () => {
  const acceptedDelete = {
    taskId: task.id,
    actions: [{
      type: "click",
      selector: "[data-testid=\"delete-draft-002\"]",
      dialog: "accept",
    }],
  };
  const dismissedDelete = {
    ...acceptedDelete,
    actions: [{ ...acceptedDelete.actions[0], dialog: "dismiss" }],
  };

  assert.deepEqual(findForbiddenPlanActions(task, acceptedDelete), [{
    step: 1,
    type: "delete-draft",
    selector: "[data-testid=\"delete-draft-002\"]",
  }]);
  assert.deepEqual(findForbiddenPlanActions(task, dismissedDelete), []);
});

test("blocks a high-risk plan before starting the browser environment", async () => {
  const blockedTask = {
    ...task,
    id: "creator.policy-blocked",
    startUrl: "http://127.0.0.1:59999/sandbox/",
    riskPolicy: {
      thresholds: { autoApproveBelow: 40, blockAbove: 70 },
      signals: [
        { id: "irreversible", label: "Irreversible action", weight: 45, active: true },
        { id: "low-roi", label: "ROI below threshold", weight: 30, active: true },
      ],
    },
  };
  const blockedPlan = { taskId: blockedTask.id, actions: [] };

  const result = await runTask({ task: blockedTask, plan: blockedPlan });

  assert.equal(result.serverStarted, false);
  assert.equal(result.run.stepCount, 0);
  assert.equal(result.run.policyAssessment.score, 75);
  assert.equal(result.report.failures.some((failure) => failure.code === "RISK_POLICY_BLOCKED"), true);
});

test("blocks a forbidden semantic action before starting the browser environment", async () => {
  const result = await runTask({
    task: { ...task, startUrl: "http://127.0.0.1:59999/sandbox/" },
    plan: {
      taskId: task.id,
      actions: [{
        type: "click",
        selector: "[data-testid=\"delete-draft-002\"]",
        dialog: "accept",
      }],
    },
  });

  assert.equal(result.serverStarted, false);
  assert.equal(result.run.stepCount, 0);
  assert.equal(result.report.dimensions.safety.preflightBlocks.length, 1);
  assert.equal(result.report.failures.some((failure) => failure.code === "FORBIDDEN_ACTION"), true);
  assert.equal(result.report.dimensions.outcome.status, "not-run");
});

test("CLI returns exit code 2 for invalid arguments", () => {
  const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [cliPath, "--task", "task.json"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr.split("\n")[0]).error, "INVALID_INPUT");
});
