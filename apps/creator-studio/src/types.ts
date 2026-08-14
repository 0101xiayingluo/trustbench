export type DraftStatus = "草稿" | "已排期";
export type RiskLevel = "medium" | "high";
export type ActionType =
  | "schedule-draft"
  | "delete-draft"
  | "cancel-delete-draft";

export type Draft = {
  id: string;
  title: string;
  status: DraftStatus;
};

export type ActionRecord = {
  sequence: number;
  type: ActionType;
  draftId: string;
  riskLevel: RiskLevel;
  timestamp: string;
};

export type PlanAction = {
  type: "click" | "fill" | "press" | "waitFor";
  selector: string;
  value?: string;
  key?: string;
  dialog?: "accept" | "dismiss";
  timeout?: number;
};

export type TrustBenchState = {
  draftStatuses: Record<string, DraftStatus>;
  draftCount: number;
  actions: ActionRecord[];
};

export type EvaluationReport = {
  evaluatorVersion: number;
  task: {
    id: string;
    version: number | null;
    riskLevel: RiskLevel | null;
  };
  passed: boolean;
  score: number;
  actionCount: number;
  stepCount: number;
  dimensions: {
    outcome: {
      passed: boolean;
      matched: number;
      total: number;
      checks: Array<{
        id: string;
        path: string;
        passed: boolean;
        expected: unknown;
        actual: unknown;
      }>;
    };
    safety: {
      passed: boolean;
      violations: Array<{
        step: number;
        type: string;
        draftId?: string;
      }>;
    };
    efficiency: {
      passed: boolean;
      steps: number;
      maxSteps: number;
      excessSteps: number;
    };
  };
  failures: Array<{
    code: string;
    message: string;
    path?: string;
    step?: number;
  }>;
};

export type RecordedRun = {
  taskId: string;
  finalState: Omit<TrustBenchState, "actions">;
  actions: ActionRecord[];
  stepCount: number;
  planActions?: PlanAction[];
  snapshots?: RunSnapshot[];
  agent?: AgentRunMetadata;
};

export type AgentRunMetadata = {
  provider: string;
  model: string;
  responseId: string | null;
  promptVersion: string;
  latencyMs: number;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
  };
  cost: {
    currency: "USD";
    estimatedUsd: number | null;
    pricingSource: "builtin" | "environment" | "unavailable";
    pricingAsOf: string | null;
    ratesPerMillion: {
      input: number;
      cachedInput: number;
      output: number;
    } | null;
  };
};

export type AgentProvider = {
  id: "openai";
  label: string;
  configured: boolean;
  model: string;
};

export type RunSnapshot = {
  step: number;
  planAction?: PlanAction;
  state: Omit<TrustBenchState, "actions">;
};

export type RunRecord = {
  id: string;
  createdAt: string;
  run: RecordedRun;
  report: EvaluationReport;
};

export type TaskDescriptor = {
  id: string;
  version: number | null;
  instruction: string;
  riskLevel: string | null;
  maxSteps: number;
  plans: Array<{
    id: string;
    label: string;
    unsafe: boolean;
  }>;
};

export type JobRecord = {
  id: string;
  taskId: string;
  planId: string;
  status: "running" | "passed" | "failed" | "error";
  startedAt: string;
  completedAt?: string;
  exitCode?: number | null;
  message?: string;
  report?: EvaluationReport;
  artifacts?: { run: string; report: string };
};

export type SuiteDescriptor = {
  id: string;
  description: string;
  caseCount: number;
  requiresProvider?: "openai";
};

export type BatchSummary = {
  suiteId: string;
  startedAt: string;
  completedAt: string;
  total: number;
  completed: number;
  passed: number;
  failed: number;
  complete: boolean;
  agentMetrics?: {
    calls: number;
    models: string[];
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    totalTokens: number;
    averageLatencyMs: number | null;
    estimatedCostUsd: number | null;
    pricedCalls: number;
  };
  artifacts: { directory: string };
};

export type BatchRecord = {
  id: string;
  createdAt: string;
  summary: BatchSummary;
};

export type BatchJob = {
  id: string;
  suiteId: string;
  status: "running" | "passed" | "failed" | "error";
  startedAt: string;
  completedAt?: string;
  exitCode?: number | null;
  message?: string;
  summary?: BatchSummary;
};
