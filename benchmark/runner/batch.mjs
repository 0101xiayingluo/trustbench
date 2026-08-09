import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { generatePlan } from "./agent.mjs";
import { runTask } from "./runner.mjs";
import { createRunId, safeTaskDirectory, writeRunArtifacts } from "./records.mjs";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateSuite(suite) {
  if (!isRecord(suite)) {
    throw new EvaluationInputError("Suite must be a JSON object.");
  }
  if (typeof suite.id !== "string" || suite.id.length === 0) {
    throw new EvaluationInputError("Suite id must be a non-empty string.");
  }
  if (!Array.isArray(suite.cases) || suite.cases.length === 0) {
    throw new EvaluationInputError("Suite cases must be a non-empty array.");
  }
  suite.cases.forEach((entry, index) => {
    if (!isRecord(entry)) {
      throw new EvaluationInputError(`Suite case at index ${index} must be an object.`);
    }
    if (typeof entry.task !== "string" || entry.task.length === 0) {
      throw new EvaluationInputError(`Suite case at index ${index} must provide task.`);
    }
    const hasPlan = typeof entry.plan === "string" && entry.plan.length > 0;
    const hasAgent = typeof entry.agentCommand === "string" && entry.agentCommand.length > 0;
    if (hasPlan === hasAgent) {
      throw new EvaluationInputError(`Suite case at index ${index} must provide either plan or agentCommand.`);
    }
    if (entry.id !== undefined && (typeof entry.id !== "string" || entry.id.length === 0)) {
      throw new EvaluationInputError(`Suite case at index ${index} id must be a non-empty string.`);
    }
  });
  return suite;
}

export async function readJson(path, label) {
  let contents;
  try {
    contents = await readFile(resolve(path), "utf8");
  } catch (error) {
    throw new EvaluationInputError(
      `Unable to read ${label} file ${path}: ${error.message}`,
    );
  }
  try {
    return JSON.parse(contents.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new EvaluationInputError(`Invalid JSON in ${label} file ${path}: ${error.message}`);
  }
}

export async function runSuite({
  suite,
  suitePath,
  outputDir,
  runsDir = "benchmark/runs",
  pretty = false,
  continueOnError = false,
  runnerOptions = {},
} = {}) {
  validateSuite(suite);
  const root = suitePath ? dirname(resolve(suitePath)) : process.cwd();
  const batchStartedAt = new Date().toISOString();
  const batchDirectory = resolve(
    outputDir ?? `benchmark/batches/${safeTaskDirectory(suite.id)}/${createRunId()}`,
  );
  await mkdir(batchDirectory, { recursive: true });
  const cases = [];

  for (const [index, entry] of suite.cases.entries()) {
    const caseId = entry.id ?? `${index + 1}-${safeTaskDirectory(entry.task)}`;
    try {
      const taskPath = resolve(root, entry.task);
      const task = await readJson(taskPath, "task");
      const plan = entry.agentCommand
        ? await generatePlan({ task, command: entry.agentCommand })
        : await readJson(resolve(root, entry.plan), "plan");
      const result = await runTask({ ...runnerOptions, task, plan });
      const artifacts = await writeRunArtifacts(
        result,
        resolve(runsDir, safeTaskDirectory(task.id), createRunId()),
        { pretty },
      );
      cases.push({
        id: caseId,
        taskId: task.id,
        passed: result.report.passed,
        score: result.report.score,
        stepCount: result.report.stepCount,
        failures: result.report.failures,
        artifacts,
      });
      if (!result.report.passed && !continueOnError) {
        break;
      }
    } catch (error) {
      cases.push({
        id: caseId,
        taskId: entry.task,
        passed: false,
        score: 0,
        stepCount: null,
        failures: [
          {
            code: "RUNNER_ERROR",
            message: error instanceof Error ? error.message : "Unknown runner error.",
          },
        ],
      });
      if (!continueOnError) {
        break;
      }
    }
  }

  const summary = {
    suiteId: suite.id,
    startedAt: batchStartedAt,
    completedAt: new Date().toISOString(),
    total: suite.cases.length,
    completed: cases.length,
    passed: cases.filter((entry) => entry.passed).length,
    failed: cases.filter((entry) => !entry.passed).length,
    complete: cases.length === suite.cases.length,
    cases,
    artifacts: { directory: batchDirectory },
  };
  await writeFile(
    resolve(batchDirectory, "batch.json"),
    `${JSON.stringify(summary, null, pretty ? 2 : 0)}\n`,
    "utf8",
  );
  return summary;
}
