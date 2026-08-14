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
    if (entry.expectation !== undefined) {
      if (!isRecord(entry.expectation)) {
        throw new EvaluationInputError(`Suite case at index ${index} expectation must be an object.`);
      }
      if (entry.expectation.reportPassed !== undefined && typeof entry.expectation.reportPassed !== "boolean") {
        throw new EvaluationInputError(`Suite case at index ${index} expectation reportPassed must be boolean.`);
      }
      if (entry.expectation.failureCodes !== undefined && (
        !Array.isArray(entry.expectation.failureCodes)
        || !entry.expectation.failureCodes.every((code) => typeof code === "string" && code.length > 0)
      )) {
        throw new EvaluationInputError(`Suite case at index ${index} expectation failureCodes must be an array of non-empty strings.`);
      }
    }
  });
  if (suite.releasePolicy !== undefined) {
    if (!isRecord(suite.releasePolicy)) {
      throw new EvaluationInputError("Suite releasePolicy must be an object when provided.");
    }
    const percentageKeys = ["minPassRate", "minPricedCallRate"];
    for (const key of percentageKeys) {
      const value = suite.releasePolicy[key];
      if (value !== undefined && (typeof value !== "number" || value < 0 || value > 1)) {
        throw new EvaluationInputError(`Suite releasePolicy ${key} must be between 0 and 1.`);
      }
    }
    for (const key of ["maxSafetyViolations", "maxAverageLatencyMs", "maxCostPerPassedRunUsd"]) {
      const value = suite.releasePolicy[key];
      if (value !== undefined && (typeof value !== "number" || value < 0)) {
        throw new EvaluationInputError(`Suite releasePolicy ${key} must be a non-negative number.`);
      }
    }
  }
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

export function summarizeAgentMetrics(cases) {
  const agents = cases.map((entry) => entry.agent).filter(isRecord);
  if (agents.length === 0) return undefined;
  const costs = agents
    .map((agent) => agent.cost?.estimatedUsd)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const usage = agents.map((agent) => isRecord(agent.usage) ? agent.usage : {});
  const latencies = agents
    .map((agent) => agent.latencyMs)
    .filter((value) => typeof value === "number" && Number.isFinite(value));
  return {
    calls: agents.length,
    models: [...new Set(agents.map((agent) => agent.model).filter((value) => typeof value === "string"))],
    inputTokens: sum(usage.map((entry) => Number(entry.inputTokens) || 0)),
    cachedInputTokens: sum(usage.map((entry) => Number(entry.cachedInputTokens) || 0)),
    outputTokens: sum(usage.map((entry) => Number(entry.outputTokens) || 0)),
    totalTokens: sum(usage.map((entry) => Number(entry.totalTokens) || 0)),
    averageLatencyMs: latencies.length > 0 ? Math.round(sum(latencies) / latencies.length) : null,
    estimatedCostUsd: costs.length === agents.length
      ? Number(sum(costs).toFixed(8))
      : null,
    pricedCalls: costs.length,
  };
}

export function evaluateCaseExpectation(report, expectation) {
  const expectedReportPassed = expectation?.reportPassed ?? true;
  const expectedFailureCodes = expectation?.failureCodes ?? [];
  const observedFailureCodes = report.failures.map((failure) => failure.code);
  const missingFailureCodes = expectedFailureCodes.filter((code) => !observedFailureCodes.includes(code));
  return {
    passed: report.passed === expectedReportPassed && missingFailureCodes.length === 0,
    expectedReportPassed,
    observedReportPassed: report.passed,
    expectedFailureCodes,
    observedFailureCodes,
    missingFailureCodes,
  };
}

export function evaluateReleaseDecision(summary, policy) {
  if (!isRecord(policy)) return undefined;
  const safetyViolations = summary.cases.reduce(
    (total, entry) => total + (Number(entry.safetyViolations) || 0),
    0,
  );
  const passRate = summary.total > 0 ? summary.passed / summary.total : 0;
  const pricedCallRate = summary.agentMetrics?.calls > 0
    ? summary.agentMetrics.pricedCalls / summary.agentMetrics.calls
    : null;
  const costPerPassedRunUsd = typeof summary.agentMetrics?.estimatedCostUsd === "number" && summary.passed > 0
    ? summary.agentMetrics.estimatedCostUsd / summary.passed
    : null;
  const checks = [];
  const addCheck = ({ id, label, actual, target, unit, passed }) => {
    const status = actual === null || actual === undefined ? "missing" : passed ? "passed" : "failed";
    checks.push({ id, label, status, actual: actual ?? null, target, unit });
  };

  if (policy.requireComplete !== false) {
    addCheck({ id: "complete", label: "回归完整性", actual: summary.complete, target: true, unit: "boolean", passed: summary.complete });
  }
  if (policy.minPassRate !== undefined) {
    addCheck({ id: "pass-rate", label: "安全有效运行率", actual: passRate, target: policy.minPassRate, unit: "ratio", passed: passRate >= policy.minPassRate });
  }
  if (policy.maxSafetyViolations !== undefined) {
    addCheck({ id: "safety", label: "安全违规", actual: safetyViolations, target: policy.maxSafetyViolations, unit: "count", passed: safetyViolations <= policy.maxSafetyViolations });
  }
  if (policy.maxAverageLatencyMs !== undefined) {
    const latency = summary.agentMetrics?.averageLatencyMs ?? null;
    addCheck({ id: "latency", label: "平均模型延迟", actual: latency, target: policy.maxAverageLatencyMs, unit: "ms", passed: typeof latency === "number" && latency <= policy.maxAverageLatencyMs });
  }
  if (policy.maxCostPerPassedRunUsd !== undefined) {
    addCheck({ id: "cost-per-pass", label: "单次通过成本", actual: costPerPassedRunUsd, target: policy.maxCostPerPassedRunUsd, unit: "usd", passed: typeof costPerPassedRunUsd === "number" && costPerPassedRunUsd <= policy.maxCostPerPassedRunUsd });
  }
  if (policy.minPricedCallRate !== undefined) {
    addCheck({ id: "pricing-coverage", label: "模型定价覆盖", actual: pricedCallRate, target: policy.minPricedCallRate, unit: "ratio", passed: typeof pricedCallRate === "number" && pricedCallRate >= policy.minPricedCallRate });
  }

  const missing = checks.filter((check) => check.status === "missing");
  const failed = checks.filter((check) => check.status === "failed");
  const status = failed.length > 0 ? "no-go" : missing.length > 0 ? "insufficient-data" : "go";
  return {
    status,
    decidedAt: summary.completedAt,
    checks,
    blockedBy: [...missing, ...failed].map((check) => check.id),
    metrics: {
      passRate,
      safetyViolations,
      averageLatencyMs: summary.agentMetrics?.averageLatencyMs ?? null,
      totalEstimatedCostUsd: summary.agentMetrics?.estimatedCostUsd ?? null,
      costPerPassedRunUsd,
      pricedCallRate,
    },
  };
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
      const expectation = evaluateCaseExpectation(result.report, entry.expectation);
      const artifacts = await writeRunArtifacts(
        result,
        resolve(runsDir, safeTaskDirectory(task.id), createRunId()),
        { pretty },
      );
      cases.push({
        id: caseId,
        taskId: task.id,
        passed: expectation.passed,
        score: expectation.passed ? 1 : 0,
        observedReportPassed: result.report.passed,
        expectation,
        stepCount: result.report.stepCount,
        safetyViolations: result.report.dimensions.safety.violations.length,
        businessScore: result.report.dimensions.business.score,
        failures: result.report.failures,
        ...(result.run.agent ? { agent: result.run.agent } : {}),
        artifacts,
      });
      if (!expectation.passed && !continueOnError) {
        break;
      }
    } catch (error) {
      cases.push({
        id: caseId,
        taskId: entry.task,
        passed: false,
        score: 0,
        stepCount: null,
        safetyViolations: null,
        businessScore: null,
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

  const agentMetrics = summarizeAgentMetrics(cases);
  const baseSummary = {
    suiteId: suite.id,
    startedAt: batchStartedAt,
    completedAt: new Date().toISOString(),
    total: suite.cases.length,
    completed: cases.length,
    passed: cases.filter((entry) => entry.passed).length,
    failed: cases.filter((entry) => !entry.passed).length,
    complete: cases.length === suite.cases.length,
    cases,
    ...(agentMetrics ? { agentMetrics } : {}),
    artifacts: { directory: batchDirectory },
  };
  const releaseDecision = evaluateReleaseDecision(baseSummary, suite.releasePolicy);
  const summary = {
    ...baseSummary,
    ...(releaseDecision ? { releaseDecision } : {}),
  };
  await writeFile(
    resolve(batchDirectory, "batch.json"),
    `${JSON.stringify(summary, null, pretty ? 2 : 0)}\n`,
    "utf8",
  );
  return summary;
}
