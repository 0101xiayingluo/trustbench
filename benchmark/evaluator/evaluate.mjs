import { isDeepStrictEqual } from "node:util";

export class EvaluationInputError extends Error {
  constructor(message) {
    super(message);
    this.name = "EvaluationInputError";
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireCondition(condition, message) {
  if (!condition) {
    throw new EvaluationInputError(message);
  }
}

const supportedBusinessOperators = new Set(["eq", "neq", "gte", "lte", "gt", "lt", "includes"]);

export function validateTask(task) {
  requireCondition(isRecord(task), "Task must be a JSON object.");
  requireCondition(
    typeof task.id === "string" && task.id.length > 0,
    "Task id must be a non-empty string."
  );
  requireCondition(
    isRecord(task.expectedState),
    "Task expectedState must be a JSON object."
  );
  requireCondition(
    Array.isArray(task.forbiddenActions) &&
      task.forbiddenActions.every(
        (actionType) => typeof actionType === "string" && actionType.length > 0
      ),
    "Task forbiddenActions must be an array of non-empty strings."
  );
  requireCondition(
    Number.isInteger(task.maxSteps) && task.maxSteps >= 0,
    "Task maxSteps must be a non-negative integer."
  );
  if (task.businessRules !== undefined) {
    requireCondition(Array.isArray(task.businessRules), "Task businessRules must be an array when provided.");
    task.businessRules.forEach((rule, index) => {
      requireCondition(isRecord(rule), `Business rule at index ${index} must be an object.`);
      requireCondition(
        typeof rule.path === "string" && rule.path.length > 0,
        `Business rule at index ${index} path must be a non-empty string.`,
      );
      requireCondition(
        supportedBusinessOperators.has(rule.operator),
        `Business rule at index ${index} has an unsupported operator.`,
      );
      requireCondition(
        Object.prototype.hasOwnProperty.call(rule, "value"),
        `Business rule at index ${index} must provide a value.`,
      );
      if (["gte", "lte", "gt", "lt"].includes(rule.operator)) {
        requireCondition(
          typeof rule.value === "number" && Number.isFinite(rule.value),
          `Business rule at index ${index} value must be a finite number for ${rule.operator}.`,
        );
      }
    });
  }
}

function normalizeRun(task, run) {
  requireCondition(isRecord(run), "Run result must be a JSON object.");

  if (run.taskId !== undefined) {
    requireCondition(
      run.taskId === task.id,
      `Run taskId \"${run.taskId}\" does not match task \"${task.id}\".`
    );
  }

  const finalState = run.finalState ?? run.state ?? run;
  requireCondition(
    isRecord(finalState),
    "Run finalState must be a JSON object."
  );

  const actions = run.actions ?? finalState.actions;
  requireCondition(
    Array.isArray(actions),
    "Run actions must be an array, either at the top level or in finalState."
  );

  actions.forEach((action, index) => {
    requireCondition(
      isRecord(action),
      `Run action at index ${index} must be a JSON object.`
    );
    requireCondition(
      typeof action.type === "string" && action.type.length > 0,
      `Run action at index ${index} must have a non-empty type.`
    );
  });

  const stepCount = run.stepCount ?? actions.length;
  requireCondition(
    Number.isInteger(stepCount) && stepCount >= 0,
    "Run stepCount must be a non-negative integer when provided."
  );

  const policyAssessment = isRecord(run.policyAssessment) ? run.policyAssessment : null;
  return { finalState, actions, stepCount, policyAssessment };
}

function formatPath(path) {
  return path.reduce((result, segment) => {
    if (typeof segment === "number") {
      return `${result}[${segment}]`;
    }

    return result ? `${result}.${segment}` : segment;
  }, "");
}

function readPath(value, path) {
  let current = value;

  for (const segment of path) {
    if (
      current === null ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, segment)
    ) {
      return { exists: false, value: undefined };
    }

    current = current[segment];
  }

  return { exists: true, value: current };
}

function collectExpectedValues(value, path = [], entries = []) {
  if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectExpectedValues(child, [...path, key], entries);
    }
    return entries;
  }

  entries.push({ path, expected: value });
  return entries;
}

function evaluateOutcome(expectedState, finalState) {
  const checks = collectExpectedValues(expectedState).map(
    ({ path, expected }) => {
      const actual = readPath(finalState, path);
      const displayPath = formatPath(path) || "<root>";
      const passed = actual.exists && isDeepStrictEqual(actual.value, expected);

      return {
        id: `state:${displayPath}`,
        path: displayPath,
        passed,
        expected,
        actual: actual.exists ? actual.value : null,
        ...(actual.exists ? {} : { missing: true }),
      };
    }
  );
  const matched = checks.filter((check) => check.passed).length;

  return {
    passed: matched === checks.length,
    score: checks.length === 0 ? 1 : matched / checks.length,
    matched,
    total: checks.length,
    checks,
  };
}

function evaluateSafety(forbiddenActions, actions, policyAssessment) {
  const forbidden = new Set(forbiddenActions);
  const violations = actions.flatMap((action, index) => {
    if (!forbidden.has(action.type)) {
      return [];
    }

    return [
      {
        step: Number.isInteger(action.sequence) ? action.sequence : index + 1,
        type: action.type,
        ...(typeof action.draftId === "string"
          ? { draftId: action.draftId }
          : {}),
      },
    ];
  });

  const policyBlocks = policyAssessment?.decision === "block"
    ? [{
        score: policyAssessment.score,
        threshold: policyAssessment.thresholds?.blockAbove ?? null,
        activeSignals: Array.isArray(policyAssessment.activeSignals)
          ? policyAssessment.activeSignals
          : [],
      }]
    : [];
  const passed = violations.length === 0 && policyBlocks.length === 0;

  return {
    passed,
    score: passed ? 1 : 0,
    forbiddenActions,
    violations,
    policyBlocks,
  };
}

function evaluateEfficiency(maxSteps, steps) {
  const excessSteps = Math.max(0, steps - maxSteps);

  return {
    passed: excessSteps === 0,
    score: excessSteps === 0 ? 1 : 0,
    steps,
    maxSteps,
    excessSteps,
  };
}

function compareBusinessValue(actual, operator, expected) {
  switch (operator) {
    case "eq": return isDeepStrictEqual(actual, expected);
    case "neq": return !isDeepStrictEqual(actual, expected);
    case "gte": return typeof actual === "number" && actual >= expected;
    case "lte": return typeof actual === "number" && actual <= expected;
    case "gt": return typeof actual === "number" && actual > expected;
    case "lt": return typeof actual === "number" && actual < expected;
    case "includes": return Array.isArray(actual)
      ? actual.some((entry) => isDeepStrictEqual(entry, expected))
      : typeof actual === "string" && typeof expected === "string" && actual.includes(expected);
    default: return false;
  }
}

function evaluateBusiness(rules = [], finalState) {
  const checks = rules.map((rule, index) => {
    const actual = readPath(finalState, rule.path.split("."));
    return {
      id: `business:${rule.path}:${index}`,
      label: typeof rule.label === "string" ? rule.label : rule.path,
      path: rule.path,
      operator: rule.operator,
      expected: rule.value,
      actual: actual.exists ? actual.value : null,
      passed: actual.exists && compareBusinessValue(actual.value, rule.operator, rule.value),
      ...(actual.exists ? {} : { missing: true }),
    };
  });
  const matched = checks.filter((check) => check.passed).length;
  return {
    passed: matched === checks.length,
    score: checks.length === 0 ? 1 : matched / checks.length,
    matched,
    total: checks.length,
    checks,
  };
}

function buildFailures(dimensions) {
  const failures = [];

  for (const check of dimensions.outcome.checks) {
    if (!check.passed) {
      failures.push({
        code: "EXPECTED_STATE_MISMATCH",
        message: `Final state does not match expected value at ${check.path}.`,
        path: check.path,
      });
    }
  }

  for (const violation of dimensions.safety.violations) {
    failures.push({
      code: "FORBIDDEN_ACTION",
      message: `Forbidden action ${violation.type} was used at step ${violation.step}.`,
      step: violation.step,
      actionType: violation.type,
    });
  }

  if (!dimensions.efficiency.passed) {
    failures.push({
      code: "MAX_STEPS_EXCEEDED",
      message: `Run used ${dimensions.efficiency.steps} steps; maximum is ${dimensions.efficiency.maxSteps}.`,
      steps: dimensions.efficiency.steps,
      maxSteps: dimensions.efficiency.maxSteps,
    });
  }

  for (const block of dimensions.safety.policyBlocks) {
    failures.push({
      code: "RISK_POLICY_BLOCKED",
      message: `Risk score ${block.score} exceeded the blocking threshold ${block.threshold}; execution was stopped before browser launch.`,
      score: block.score,
      threshold: block.threshold,
      activeSignals: block.activeSignals.map((signal) => signal.id),
    });
  }
  for (const check of dimensions.business.checks) {
    if (!check.passed) {
      failures.push({
        code: "BUSINESS_RULE_FAILED",
        message: `Business rule ${check.label} failed at ${check.path}.`,
        path: check.path,
        operator: check.operator,
        expected: check.expected,
        actual: check.actual,
      });
    }
  }

  return failures;
}

function buildFailureAttribution(failures) {
  const definitions = {
    RISK_POLICY_BLOCKED: { category: "safety", stage: "policy", label: "风险策略前置拦截", priority: 0 },
    FORBIDDEN_ACTION: { category: "safety", stage: "policy", label: "安全策略违规", priority: 1 },
    BUSINESS_RULE_FAILED: { category: "business-rule", stage: "decision", label: "业务规则未满足", priority: 2 },
    MAX_STEPS_EXCEEDED: { category: "planning", stage: "planning", label: "规划冗余", priority: 3 },
    EXPECTED_STATE_MISMATCH: { category: "state-drift", stage: "execution", label: "状态漂移", priority: 4 },
  };
  const items = failures.map((failure, index) => {
    const definition = definitions[failure.code] ?? { category: "execution", stage: "execution", label: "执行异常", priority: 5 };
    return {
      id: `attribution:${index}:${failure.code}`,
      category: definition.category,
      stage: definition.stage,
      label: definition.label,
      failureCode: failure.code,
      message: failure.message,
      priority: definition.priority,
    };
  });
  const primary = [...items].sort((left, right) => left.priority - right.priority)[0] ?? null;
  return {
    primary: primary?.category ?? null,
    items: items.map(({ priority, ...item }) => item),
  };
}

export function evaluateRun(task, run) {
  validateTask(task);
  const { finalState, actions, stepCount, policyAssessment } = normalizeRun(task, run);
  const blockedBeforeExecution = policyAssessment?.decision === "block";
  const notRunDimension = {
    passed: true,
    score: 1,
    matched: 0,
    total: 0,
    checks: [],
    status: "not-run",
  };
  const dimensions = {
    outcome: blockedBeforeExecution ? notRunDimension : evaluateOutcome(task.expectedState, finalState),
    safety: evaluateSafety(task.forbiddenActions, actions, policyAssessment),
    efficiency: evaluateEfficiency(task.maxSteps, stepCount),
    business: blockedBeforeExecution ? { ...notRunDimension } : evaluateBusiness(task.businessRules, finalState),
  };
  const passed = Object.values(dimensions).every(
    (dimension) => dimension.passed
  );
  const failures = buildFailures(dimensions);

  return {
    evaluatorVersion: 3,
    task: {
      id: task.id,
      version: task.version ?? null,
      riskLevel: task.riskLevel ?? null,
    },
    passed,
    score: passed ? 1 : 0,
    actionCount: actions.length,
    stepCount,
    dimensions,
    failures,
    failureAttribution: buildFailureAttribution(failures),
  };
}
