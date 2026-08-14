#!/usr/bin/env node

import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { runStability } from "./stability.mjs";

const usage = `Usage:
  npm run test:stability -- --suite <suite.json> [options]

Options:
  --rounds <number>       Number of consecutive suite runs (default: 3)
  --output <file>         Persist the compact stability report
  --base-url <url>        Override the host/port while keeping task paths
  --browser <name>        auto, msedge, chromium, or another Playwright channel
  --browser-path <path>   Use a specific browser executable
  --pretty                Pretty-print the report
  --help                  Show this message`;

function parseArguments(argv) {
  const options = { rounds: 3, browser: "auto", pretty: false };
  const values = {
    "--suite": "suitePath",
    "-s": "suitePath",
    "--rounds": "rounds",
    "--output": "outputPath",
    "-o": "outputPath",
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
    const key = values[argument];
    if (!key) throw new EvaluationInputError(`Unknown argument: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("-")) throw new EvaluationInputError(`Missing value for ${argument}.`);
    options[key] = key === "rounds" ? Number(value) : value;
    index += 1;
  }
  if (!options.suitePath) throw new EvaluationInputError("--suite is required.");
  return options;
}
try {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage}\n`);
  } else {
    const report = await runStability({
      suitePath: options.suitePath,
      rounds: options.rounds,
      outputPath: options.outputPath,
      runnerOptions: {
        baseUrl: options.baseUrl,
        browser: options.browser,
        browserPath: options.browserPath,
      },
    });
    process.stdout.write(`${JSON.stringify(report, null, options.pretty ? 2 : 0)}\n`);
    process.exitCode = report.releaseDecision.status === "go" ? 0 : 1;
  }
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })}\n${usage}\n`);
  process.exitCode = error instanceof EvaluationInputError ? 2 : 1;
}
