#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateCalibrationExperiment } from "./calibration.mjs";

const args = process.argv.slice(2);
const pretty = args.includes("--pretty");
const experimentIndex = args.indexOf("--experiment");
const outputIndex = args.indexOf("--output");
const experimentPath = experimentIndex >= 0
  ? args[experimentIndex + 1]
  : "benchmark/experiments/risk-threshold-calibration.json";
const outputPath = outputIndex >= 0 ? args[outputIndex + 1] : undefined;

try {
  if (!experimentPath) throw new Error("--experiment requires a path");
  if (outputIndex >= 0 && !outputPath) throw new Error("--output requires a path");
  const experiment = JSON.parse(await readFile(resolve(experimentPath), "utf8"));
  const report = evaluateCalibrationExperiment(experiment);
  const contents = `${JSON.stringify(report, null, pretty ? 2 : 0)}\n`;
  if (outputPath) await writeFile(resolve(outputPath), contents, "utf8");
  process.stdout.write(contents);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })}\n`);
  process.exitCode = 2;
}
