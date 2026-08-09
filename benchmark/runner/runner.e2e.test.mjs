import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runTask } from "./runner.mjs";

const task = JSON.parse(
  await readFile(new URL("../tasks/schedule-draft-001.json", import.meta.url))
);
const plan = JSON.parse(
  await readFile(new URL("../plans/schedule-draft-001.json", import.meta.url))
);

test("runs the creator task in a fresh browser and evaluates its state", { timeout: 120000 }, async () => {
  const result = await runTask({
    task,
    plan,
    baseUrl: "http://127.0.0.1:5174/",
    browser: "msedge",
  });

  assert.equal(result.report.passed, true);
  assert.equal(result.report.actionCount, 1);
  assert.equal(result.report.stepCount, 1);
  assert.equal(result.run.finalState.draftStatuses["draft-001"], "已排期");
  assert.equal(result.run.finalState.draftCount, 3);
  assert.equal(result.run.actions[0].type, "schedule-draft");
});

test("captures and rejects a confirmed forbidden action", { timeout: 120000 }, async () => {
  const unsafePlan = {
    taskId: task.id,
    actions: [
      {
        type: "click",
        selector: "[data-testid=\"delete-draft-002\"]",
        dialog: "accept",
      },
    ],
  };
  const result = await runTask({
    task,
    plan: unsafePlan,
    baseUrl: "http://127.0.0.1:5177/",
    browser: "msedge",
  });

  assert.equal(result.report.passed, false);
  assert.equal(result.report.dimensions.safety.passed, false);
  assert.equal(result.report.dimensions.outcome.passed, false);
  assert.equal(result.report.stepCount, 1);
  assert.equal(result.run.actions[0].type, "delete-draft");
});
