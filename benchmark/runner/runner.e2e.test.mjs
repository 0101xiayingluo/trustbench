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
const campaignTask = JSON.parse(
  await readFile(new URL("../tasks/launch-campaign-001.json", import.meta.url))
);
const campaignPlan = JSON.parse(
  await readFile(new URL("../plans/launch-campaign-001.json", import.meta.url))
);

test("runs the creator task in a fresh browser and evaluates its state", { timeout: 120000 }, async () => {
  const result = await runTask({
    task,
    plan,
    baseUrl: "http://127.0.0.1:5174/",
    browser: "auto",
  });

  assert.equal(result.report.passed, true);
  assert.equal(result.report.actionCount, 1);
  assert.equal(result.report.stepCount, 1);
  assert.equal(result.run.finalState.draftStatuses["draft-001"], "已排期");
  assert.equal(result.run.finalState.draftCount, 3);
  assert.equal(result.run.actions[0].type, "schedule-draft");
  assert.equal(result.run.snapshots?.length, 2);
  assert.equal(result.run.planActions?.length, 1);
  assert.equal(result.run.snapshots?.[1].planAction?.type, "click");
  assert.equal(result.run.snapshots?.[0].state.draftStatuses["draft-001"], "草稿");
  assert.equal(result.run.snapshots?.[1].state.draftStatuses["draft-001"], "已排期");
});

test("keeps non-semantic plan steps in replay snapshots", { timeout: 120000 }, async () => {
  const replayPlan = {
    taskId: task.id,
    actions: [
      { type: "waitFor", selector: "[data-testid=\"schedule-draft-001\"]" },
      { type: "click", selector: "[data-testid=\"schedule-draft-001\"]" },
    ],
  };
  const result = await runTask({
    task,
    plan: replayPlan,
    baseUrl: "http://127.0.0.1:5174/",
    browser: "auto",
  });

  assert.equal(result.report.passed, true);
  assert.equal(result.report.stepCount, 2);
  assert.equal(result.run.actions.length, 1);
  assert.equal(result.run.planActions?.length, 2);
  assert.equal(result.run.snapshots?.length, 3);
  assert.equal(result.run.snapshots?.[1].planAction?.type, "waitFor");
  assert.equal(result.run.snapshots?.[2].planAction?.type, "click");
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
    browser: "auto",
  });

  assert.equal(result.report.passed, false);
  assert.equal(result.report.dimensions.safety.passed, false);
  assert.equal(result.report.dimensions.outcome.passed, false);
  assert.equal(result.report.stepCount, 1);
  assert.equal(result.run.actions[0].type, "delete-draft");
});

test("executes AI review, human approval, and launch as one governed business workflow", { timeout: 120000 }, async () => {
  const result = await runTask({
    task: campaignTask,
    plan: campaignPlan,
    baseUrl: "http://127.0.0.1:5178/",
    browser: "auto",
  });

  assert.equal(result.report.passed, true);
  assert.equal(result.report.dimensions.business.passed, true);
  assert.equal(result.report.dimensions.business.matched, 3);
  assert.equal(result.run.finalState.campaign.reviewStatus, "passed");
  assert.equal(result.run.finalState.campaign.approvalStatus, "approved");
  assert.equal(result.run.finalState.campaign.launchStatus, "launched");
  assert.deepEqual(
    result.run.actions.map((action) => action.type),
    ["run-campaign-review", "request-campaign-approval", "approve-campaign", "launch-campaign"],
  );
});

test("rejects a campaign that reaches launch by bypassing human approval", { timeout: 120000 }, async () => {
  const unsafePlan = JSON.parse(
    await readFile(new URL("../plans/launch-campaign-001.unsafe.json", import.meta.url))
  );
  const result = await runTask({
    task: campaignTask,
    plan: unsafePlan,
    baseUrl: "http://127.0.0.1:5179/",
    browser: "auto",
  });

  assert.equal(result.run.finalState.campaign.launchStatus, "launched");
  assert.equal(result.report.passed, false);
  assert.equal(result.report.dimensions.safety.passed, false);
  assert.equal(result.report.dimensions.business.passed, false);
  assert.equal(result.report.dimensions.safety.violations[0].type, "bypass-campaign-approval");
});
