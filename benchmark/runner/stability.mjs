import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { EvaluationInputError } from "../evaluator/evaluate.mjs";
import { readJson, runSuite } from "./batch.mjs";
import { createRunId, safeTaskDirectory } from "./records.mjs";

function validateRounds(rounds) {
  if (!Number.isInteger(rounds) || rounds < 2) {
    throw new EvaluationInputError("Stability rounds must be an integer of at least 2.");
  }
  return rounds;
}

function compactRound(summary, round) {
  return {
    round,
    total: summary.total,
    completed: summary.completed,
    passed: summary.passed,
    failed: summary.failed,
    complete: summary.complete,
    releaseStatus: summary.releaseDecision?.status ?? null,
    cases: summary.cases.map((entry) => ({
      id: entry.id,
      taskId: entry.taskId,
      passed: entry.passed,
      failureCodes: (entry.failures ?? []).map((failure) => failure.code),
    })),
  };
}

export function summarizeStabilityRounds(roundSummaries) {
  if (!Array.isArray(roundSummaries) || roundSummaries.length < 2) {
    throw new EvaluationInputError("Stability summary requires at least two round summaries.");
  }

  const caseIds = roundSummaries[0].cases.map((entry) => entry.id);
  const expectedCaseIds = new Set(caseIds);
  for (const summary of roundSummaries) {
    const observed = new Set(summary.cases.map((entry) => entry.id));
    if (observed.size !== expectedCaseIds.size || caseIds.some((id) => !observed.has(id))) {
      throw new EvaluationInputError("Every stability round must contain the same case ids.");
    }
  }

  const cases = caseIds.map((id) => {
    const executions = roundSummaries.map((summary) => summary.cases.find((entry) => entry.id === id));
    const passedExecutions = executions.filter((entry) => entry?.passed).length;
    const outcomes = executions.map((entry) => Boolean(entry?.passed));
    return {
      id,
      taskId: executions[0]?.taskId ?? null,
      executions: executions.length,
      passedExecutions,
      passRate: passedExecutions / executions.length,
      stable: outcomes.every((outcome) => outcome === outcomes[0]),
      consistentlyPassed: outcomes.every(Boolean),
    };
  });

  const totalExecutions = cases.reduce((total, entry) => total + entry.executions, 0);
  const passedExecutions = cases.reduce((total, entry) => total + entry.passedExecutions, 0);
  const completeRounds = roundSummaries.filter((summary) => summary.complete).length;
  const stableCases = cases.filter((entry) => entry.stable).length;
  const consistentlyPassedCases = cases.filter((entry) => entry.consistentlyPassed).length;
  const status = completeRounds === roundSummaries.length
    && stableCases === cases.length
    && consistentlyPassedCases === cases.length
    ? "go"
    : "no-go";

  return {
    protocolVersion: 1,
    rounds: roundSummaries.length,
    caseCount: cases.length,
    totalExecutions,
    passedExecutions,
    passRate: totalExecutions > 0 ? passedExecutions / totalExecutions : 0,
    completeRounds,
    stableCaseCount: stableCases,
    flakyCaseCount: cases.length - stableCases,
    consistentlyPassedCaseCount: consistentlyPassedCases,
    releaseDecision: {
      status,
      checks: {
        allRoundsComplete: completeRounds === roundSummaries.length,
        allCasesStable: stableCases === cases.length,
        allExecutionsPassed: consistentlyPassedCases === cases.length,
      },
    },
    cases,
  };
}

export async function runStability({
  suite,
  suitePath,
  rounds = 3,
  outputPath,
  batchOutputRoot,
  runsDir = "benchmark/runs",
  runnerOptions = {},
  runSuiteFn = runSuite,
} = {}) {
  validateRounds(rounds);
  const resolvedSuite = suite ?? await readJson(suitePath, "suite");
  const batchRoot = resolve(
    batchOutputRoot
      ?? `benchmark/batches/stability/${safeTaskDirectory(resolvedSuite.id)}/${createRunId()}`,
  );
  const summaries = [];

  for (let round = 1; round <= rounds; round += 1) {
    const summary = await runSuiteFn({
      suite: resolvedSuite,
      suitePath,
      outputDir: resolve(batchRoot, `round-${round}`),
      runsDir,
      pretty: true,
      continueOnError: true,
      runnerOptions,
    });
    summaries.push(compactRound(summary, round));
  }

  const aggregate = summarizeStabilityRounds(summaries);
  const report = {
    suiteId: resolvedSuite.id,
    ...aggregate,
    roundSummaries: summaries,
  };

  if (outputPath) {
    const resolvedOutput = resolve(outputPath);
    await mkdir(dirname(resolvedOutput), { recursive: true });
    await writeFile(resolvedOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  return report;
}
