#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { EvaluationInputError, evaluateRun } from "./evaluate.mjs";

const usage = `Usage:
  npm run evaluate -- --task <task.json> --result <run.json> [--output <report.json>] [--pretty]

Exit codes:
  0  evaluation passed
  1  evaluation completed but failed
  2  invalid arguments or input`;

function parseArguments(argv) {
  const options = { pretty: false };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      return { help: true };
    }

    if (argument === "--pretty") {
      options.pretty = true;
      continue;
    }

    const key = {
      "--task": "taskPath",
      "-t": "taskPath",
      "--result": "resultPath",
      "-r": "resultPath",
      "--output": "outputPath",
      "-o": "outputPath",
    }[argument];

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

  if (!options.taskPath || !options.resultPath) {
    throw new EvaluationInputError("Both --task and --result are required.");
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

    const [task, run] = await Promise.all([
      readJson(options.taskPath, "task"),
      readJson(options.resultPath, "result"),
    ]);
    const report = evaluateRun(task, run);
    const json = `${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`;

    if (options.outputPath) {
      await writeFile(resolve(options.outputPath), json, "utf8");
    }

    process.stdout.write(json);
    process.exitCode = report.passed ? 0 : 1;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown evaluator error.";
    process.stderr.write(
      `${JSON.stringify({ error: "INVALID_INPUT", message })}\n${usage}\n`
    );
    process.exitCode = 2;
  }
}

await main();
