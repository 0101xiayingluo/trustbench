#!/usr/bin/env node

import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { readJson, runSuite } from "./batch.mjs";

const usage = `Usage:
  npm run batch -- --suite <suite.json> [options]

Options:
  --output-dir <dir>       Directory for batch.json and run artifacts
  --runs-dir <dir>         Root directory for individual run records
  --base-url <url>         Override the host/port while keeping task paths
  --browser <name>         auto, msedge, chromium, or another Playwright channel
  --browser-path <path>    Use a specific browser executable
  --continue-on-error      Run every case after a failed case
  --pretty                 Pretty-print the summary
  --help                   Show this message

Exit codes:
  0  every completed case passed
  1  at least one case failed evaluation or execution
  2  invalid arguments or input`;

function parseArguments(argv) {
  const options = { browser: "auto", pretty: false, continueOnError: false };
  const values = {
    "--suite": "suitePath",
    "-s": "suitePath",
    "--output-dir": "outputDir",
    "-o": "outputDir",
    "--runs-dir": "runsDir",
    "--base-url": "baseUrl",
    "--browser": "browser",
    "--browser-path": "browserPath",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--pretty") {
      options.pretty = true;
      continue;
    }
    if (argument === "--continue-on-error") {
      options.continueOnError = true;
      continue;
    }
    const key = values[argument];
    if (!key) throw new EvaluationInputError(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("-")) {
      throw new EvaluationInputError(`Missing value for ${argument}.`);
    }
    options[key] = value;
    index += 1;
  }
  if (!options.suitePath) {
    throw new EvaluationInputError("--suite is required.");
  }
  return options;
}

async function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(`${usage}\n`);
      return;
    }
    const suite = await readJson(options.suitePath, "suite");
    const summary = await runSuite({
      suite,
      suitePath: options.suitePath,
      outputDir: options.outputDir,
      runsDir: options.runsDir,
      pretty: options.pretty,
      continueOnError: options.continueOnError,
      runnerOptions: {
        baseUrl: options.baseUrl,
        browser: options.browser,
        browserPath: options.browserPath,
      },
    });
    process.stdout.write(`${JSON.stringify(summary, null, options.pretty ? 2 : 0)}\n`);
    process.exitCode = summary.complete && summary.failed === 0 ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown batch error.";
    process.stderr.write(
      `${JSON.stringify({ error: error instanceof EvaluationInputError ? "INVALID_INPUT" : "BATCH_ERROR", message })}\n${usage}\n`,
    );
    process.exitCode = error instanceof EvaluationInputError ? 2 : 1;
  }
}

await main();
