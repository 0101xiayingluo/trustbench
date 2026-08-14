#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { generatePlan } from "./agent.mjs";
import { createRunId, safeTaskDirectory, writeRunArtifacts } from "./records.mjs";
import { runTask } from "./runner.mjs";

const usage = `Usage:
  npm run run -- --task <task.json> --plan <plan.json> [options]
  npm run run -- --task <task.json> --agent-command <command> [options]

Options:
  --agent-command <cmd>    Read {task} JSON on stdin and return a plan JSON object
  --output-dir <dir>       Directory for run.json and report.json
  --base-url <url>         Override the host/port while keeping the task path
  --browser <name>         auto, msedge, chromium, or another Playwright channel
  --browser-path <path>    Use a specific browser executable
  --headed                 Show the browser window
  --server-timeout <ms>    Environment startup/navigation timeout (default: 15000)
  --action-timeout <ms>    Per-action timeout (default: 5000)
  --agent-timeout <ms>     Agent command timeout (default: 30000)
  --pretty                 Pretty-print the report
  --help                   Show this message

Exit codes:
  0  run completed and passed evaluation
  1  run completed but failed evaluation
  2  invalid arguments or input
  3  environment, browser, or action execution error`;

function parseArguments(argv) {
  const options = {
    browser: "auto",
    headless: true,
    pretty: false,
    serverTimeout: 15000,
    actionTimeout: 5000,
    agentTimeout: 30000,
  };
  const values = {
    "--task": "taskPath",
    "-t": "taskPath",
    "--plan": "planPath",
    "-p": "planPath",
    "--agent-command": "agentCommand",
    "--output-dir": "outputDir",
    "-o": "outputDir",
    "--base-url": "baseUrl",
    "--browser": "browser",
    "--browser-path": "browserPath",
    "--server-timeout": "serverTimeout",
    "--action-timeout": "actionTimeout",
    "--agent-timeout": "agentTimeout",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }
    if (argument === "--headed") {
      options.headless = false;
      continue;
    }
    if (argument === "--pretty") {
      options.pretty = true;
      continue;
    }

    const key = values[argument];
    if (!key) {
      throw new EvaluationInputError(`Unknown argument: ${argument}`);
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("-")) {
      throw new EvaluationInputError(`Missing value for ${argument}.`);
    }
    options[key] = value;
    index += 1;
  }

  if (!options.taskPath || (!options.planPath && !options.agentCommand)) {
    throw new EvaluationInputError("--task and either --plan or --agent-command are required.");
  }
  if (options.planPath && options.agentCommand) {
    throw new EvaluationInputError("Use either --plan or --agent-command, not both.");
  }

  for (const key of ["serverTimeout", "actionTimeout", "agentTimeout"]) {
    if (!/^\d+$/.test(String(options[key])) || Number(options[key]) <= 0) {
      throw new EvaluationInputError(`${key} must be a positive integer.`);
    }
    options[key] = Number(options[key]);
  }

  return options;
}

async function readJson(path, label) {
  let contents;
  try {
    contents = await readFile(resolve(path), "utf8");
  } catch (error) {
    throw new EvaluationInputError(
      `Unable to read ${label} file ${path}: ${error.message}`
    );
  }

  try {
    return JSON.parse(contents.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new EvaluationInputError(
      `Invalid JSON in ${label} file ${path}: ${error.message}`
    );
  }
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage}\n`);
      return;
    }

    const task = await readJson(options.taskPath, "task");
    const plan = options.agentCommand
      ? await generatePlan({ task, command: options.agentCommand, timeout: options.agentTimeout })
      : await readJson(options.planPath, "plan");
    const result = await runTask({
      task,
      plan,
      baseUrl: options.baseUrl,
      browser: options.browser,
      browserPath: options.browserPath,
      headless: options.headless,
      serverTimeout: options.serverTimeout,
      actionTimeout: options.actionTimeout,
    });
    const runId = createRunId();
    const outputDir = resolve(
      options.outputDir ??
        `benchmark/runs/${safeTaskDirectory(task.id)}/${runId}`
    );
    const artifacts = await writeRunArtifacts(result, outputDir, { pretty: options.pretty });

    process.stdout.write(
      `${JSON.stringify(
        {
          ...result.report,
          ...(result.run.agent ? { agent: result.run.agent } : {}),
          artifacts: {
            ...artifacts,
          },
        },
        null,
        options.pretty ? 2 : 0
      )}\n`
    );
    process.exitCode = result.report.passed ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown runner error.";
    const invalidInput = error instanceof EvaluationInputError;
    process.stderr.write(
      `${JSON.stringify({ error: invalidInput ? "INVALID_INPUT" : "RUNNER_ERROR", message })}\n${usage}\n`
    );
    process.exitCode = invalidInput ? 2 : 3;
  }
}

await main();
