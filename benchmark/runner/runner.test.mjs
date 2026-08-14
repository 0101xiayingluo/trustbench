import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validatePlan } from "./plan.mjs";
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
    () => validatePlan(task, { actions: [{ type: "fill", selector: "#name", value: "Ada", dialog: "accept" }] }),
    /dialog must be accept or dismiss on a click action/
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

test("CLI returns exit code 2 for invalid arguments", () => {
  const cliPath = fileURLToPath(new URL("./cli.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [cliPath, "--task", "task.json"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr.split("\n")[0]).error, "INVALID_INPUT");
});
