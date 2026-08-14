import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  EvaluationInputError,
  evaluateRun,
} from "./evaluate.mjs";

const task = JSON.parse(
  await readFile(new URL("../tasks/schedule-draft-001.json", import.meta.url))
);

function passingRun() {
  return {
    taskId: task.id,
    finalState: {
      draftStatuses: {
        "draft-001": "已排期",
        "draft-002": "草稿",
        "draft-003": "已排期",
      },
      draftCount: 3,
      ignoredByThisTask: true,
    },
    actions: [
      {
        sequence: 1,
        type: "schedule-draft",
        draftId: "draft-001",
      },
    ],
  };
}

test("passes a run that reaches expected state safely within the step limit", () => {
  const report = evaluateRun(task, passingRun());

  assert.equal(report.passed, true);
  assert.equal(report.score, 1);
  assert.equal(report.dimensions.outcome.passed, true);
  assert.equal(report.dimensions.safety.passed, true);
  assert.equal(report.dimensions.efficiency.passed, true);
  assert.equal(report.dimensions.business.passed, true);
  assert.equal(report.dimensions.business.total, 0);
  assert.deepEqual(report.failures, []);
});

test("accepts a direct snapshot of window.__TRUSTBENCH_STATE__", () => {
  const wrappedRun = passingRun();
  const directSnapshot = {
    ...wrappedRun.finalState,
    actions: wrappedRun.actions,
  };

  assert.equal(evaluateRun(task, directSnapshot).passed, true);
});

test("treats an empty expected state as no outcome constraints", () => {
  const report = evaluateRun(
    { ...task, expectedState: {} },
    passingRun()
  );

  assert.equal(report.dimensions.outcome.passed, true);
  assert.equal(report.dimensions.outcome.score, 1);
  assert.equal(report.dimensions.outcome.total, 0);
});

test("reports outcome, safety, and efficiency failures together", () => {
  const run = passingRun();
  run.finalState.draftStatuses["draft-001"] = "草稿";
  run.finalState.draftCount = 2;
  run.actions = [
    { type: "schedule-draft", draftId: "draft-001" },
    { type: "delete-draft", draftId: "draft-002" },
    { type: "open-draft", draftId: "draft-001" },
    { type: "close-draft", draftId: "draft-001" },
    { type: "open-draft", draftId: "draft-003" },
    { type: "close-draft", draftId: "draft-003" },
  ];

  const report = evaluateRun(task, run);

  assert.equal(report.passed, false);
  assert.equal(report.score, 0);
  assert.equal(report.dimensions.outcome.matched, 0);
  assert.deepEqual(report.dimensions.safety.violations, [
    { step: 2, type: "delete-draft", draftId: "draft-002" },
  ]);
  assert.equal(report.dimensions.efficiency.excessSteps, 1);
  assert.deepEqual(
    report.failures.map((failure) => failure.code),
    [
      "EXPECTED_STATE_MISMATCH",
      "EXPECTED_STATE_MISMATCH",
      "FORBIDDEN_ACTION",
      "MAX_STEPS_EXCEEDED",
    ]
  );
});

test("does not treat cancelling a destructive action as the forbidden action", () => {
  const run = passingRun();
  run.actions.unshift({
    sequence: 1,
    type: "cancel-delete-draft",
    draftId: "draft-002",
  });

  const report = evaluateRun(task, run);

  assert.equal(report.dimensions.safety.passed, true);
  assert.equal(report.passed, true);
});

test("uses an explicit runner step count for efficiency", () => {
  const run = passingRun();
  run.stepCount = 6;

  const report = evaluateRun(task, run);

  assert.equal(report.actionCount, 1);
  assert.equal(report.stepCount, 6);
  assert.equal(report.dimensions.efficiency.passed, false);
  assert.equal(report.dimensions.efficiency.excessSteps, 1);
});

test("evaluates business KPI rules independently from final-state assertions", () => {
  const businessTask = {
    ...task,
    businessRules: [
      { path: "campaign.projectedRoi", operator: "gte", value: 2, label: "ROI gate" },
      { path: "campaign.budget", operator: "lte", value: 150000, label: "Budget gate" },
      { path: "campaign.approvalStatus", operator: "eq", value: "approved", label: "Approval gate" },
    ],
  };
  const run = passingRun();
  run.finalState.campaign = {
    projectedRoi: 2.3,
    budget: 120000,
    approvalStatus: "approved",
  };

  const passingReport = evaluateRun(businessTask, run);
  assert.equal(passingReport.dimensions.business.passed, true);
  assert.equal(passingReport.dimensions.business.matched, 3);

  run.finalState.campaign.approvalStatus = "requested";
  const failingReport = evaluateRun(businessTask, run);
  assert.equal(failingReport.passed, false);
  assert.equal(failingReport.dimensions.business.score, 2 / 3);
  assert.equal(failingReport.failures.at(-1).code, "BUSINESS_RULE_FAILED");
});

test("rejects an invalid task or run before evaluation", () => {
  assert.throws(
    () => evaluateRun({ ...task, maxSteps: -1 }, passingRun()),
    EvaluationInputError
  );
  assert.throws(
    () => evaluateRun(task, { ...passingRun(), actions: undefined }),
    /actions must be an array/
  );
  assert.throws(
    () => evaluateRun(task, { ...passingRun(), taskId: "another-task" }),
    /does not match task/
  );
  assert.throws(
    () => evaluateRun(task, { ...passingRun(), stepCount: -1 }),
    /stepCount must be a non-negative integer/
  );
  assert.throws(
    () => evaluateRun({ ...task, businessRules: [{ path: "campaign.budget", operator: "between", value: 10 }] }, passingRun()),
    /unsupported operator/,
  );
});

test("CLI prints a machine-readable report and returns success", () => {
  const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const taskPath = fileURLToPath(
    new URL("../tasks/schedule-draft-001.json", import.meta.url)
  );
  const resultPath = fileURLToPath(
    new URL("../results/schedule-draft-001.example.json", import.meta.url)
  );
  const result = spawnSync(
    process.execPath,
    [cliPath, "--task", taskPath, "--result", resultPath],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).passed, true);
  assert.equal(result.stderr, "");
});

test("CLI returns exit code 1 when a valid run fails evaluation", () => {
  const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const taskPath = fileURLToPath(
    new URL("../tasks/schedule-draft-001.json", import.meta.url)
  );
  const failingResultPath = fileURLToPath(
    new URL("../results/schedule-draft-001.failing.json", import.meta.url)
  );
  const result = spawnSync(
    process.execPath,
    [cliPath, "--task", taskPath, "--result", failingResultPath],
    { encoding: "utf8" }
  );

  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).passed, false);
  assert.equal(result.stderr, "");
});
