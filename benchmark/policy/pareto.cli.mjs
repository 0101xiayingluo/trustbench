#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { evaluatePolicyTradeoffs } from "./pareto.mjs";

const args = process.argv.slice(2);
const pretty = args.includes("--pretty");
const experimentIndex = args.indexOf("--experiment");
const outputIndex = args.indexOf("--output");
const experimentPath = experimentIndex >= 0
  ? args[experimentIndex + 1]
  : "benchmark/experiments/risk-threshold-calibration.json";
const outputPath = outputIndex >= 0
  ? args[outputIndex + 1]
  : "benchmark/results/risk-policy-pareto.json";

try {
  const experiment = JSON.parse(await readFile(resolve(experimentPath), "utf8"));
  const report = evaluatePolicyTradeoffs({ cases: experiment.cases, policies: experiment.paretoPolicies });
  const contents = `${JSON.stringify(report, null, pretty ? 2 : 0)}\n`;
  await mkdir(dirname(resolve(outputPath)), { recursive: true });
  await writeFile(resolve(outputPath), contents, "utf8");
  process.stdout.write(contents);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })}\n`);
  process.exitCode = 2;
}
