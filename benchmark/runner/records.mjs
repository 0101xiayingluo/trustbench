import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export function createRunId() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
}

export function safeTaskDirectory(taskId) {
  return taskId.replace(/[^a-z0-9_.-]+/gi, "-");
}

export async function writeRunArtifacts(result, outputDir, { pretty = false } = {}) {
  const directory = resolve(outputDir);
  await mkdir(directory, { recursive: true });
  const runPath = resolve(directory, "run.json");
  const reportPath = resolve(directory, "report.json");
  await Promise.all([
    writeFile(runPath, `${JSON.stringify(result.run, null, pretty ? 2 : 0)}\n`, "utf8"),
    writeFile(reportPath, `${JSON.stringify(result.report, null, pretty ? 2 : 0)}\n`, "utf8"),
  ]);
  return { run: runPath, report: reportPath };
}
