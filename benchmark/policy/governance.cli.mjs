import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { evaluateGovernanceBenchmark } from "./governance.mjs";

const args = process.argv.slice(2);
const pretty = args.includes("--pretty");
const experimentIndex = args.indexOf("--experiment");
const experimentPath = experimentIndex >= 0
  ? args[experimentIndex + 1]
  : "benchmark/experiments/risk-aware-routing.json";

if (!experimentPath) {
  process.stderr.write(`${JSON.stringify({ error: "--experiment requires a path" })}\n`);
  process.exitCode = 2;
} else {
  try {
    const experiment = JSON.parse(await readFile(resolve(experimentPath), "utf8"));
    const report = evaluateGovernanceBenchmark(experiment.governanceBenchmark);
    process.stdout.write(`${JSON.stringify(report, null, pretty ? 2 : 0)}\n`);
    process.exitCode = report.passed ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" })}\n`);
    process.exitCode = 2;
  }
}
