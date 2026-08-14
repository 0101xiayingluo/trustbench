export type DraftStatus = "草稿" | "已排期";
export type RiskLevel = "medium" | "high";
export type ActionType =
  | "schedule-draft"
  | "delete-draft"
  | "cancel-delete-draft"
  | "run-campaign-review"
  | "request-campaign-approval"
  | "approve-campaign"
  | "cancel-campaign-approval"
  | "launch-campaign"
  | "bypass-campaign-approval"
  | "cancel-emergency-launch";

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
  entityType?: "draft" | "campaign";
};

export type CampaignState = {
  id: string;
  budgetChangePercent: number;
  historicalRoi: number;
  projectedRoi: number;
  riskScore: number;
  riskDecision: "auto-approve" | "human-review" | "block";
  reviewStatus: "pending" | "passed";
  approvalStatus: "pending" | "requested" | "approved";
  launchStatus: "draft" | "launched";
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
  campaign?: CampaignState;
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
      forbiddenActions?: string[];
      violations: Array<{
        step: number;
        type: string;
        draftId?: string;
      }>;
      policyBlocks?: Array<{
        score: number;
        threshold: number | null;
        activeSignals: Array<{ id: string; label: string; weight: number; active: boolean }>;
      }>;
    };
    efficiency: {
      passed: boolean;
      steps: number;
      maxSteps: number;
      excessSteps: number;
    };
    business?: {
      passed: boolean;
      score: number;
      matched: number;
      total: number;
      checks: Array<{
        id: string;
        label: string;
        path: string;
        operator: string;
        expected: unknown;
        actual: unknown;
        passed: boolean;
      }>;
    };
  };
  failures: Array<{
    code: string;
    message: string;
    path?: string;
    step?: number;
  }>;
  failureAttribution?: {
    primary: string | null;
    items: Array<{
      id: string;
      category: string;
      stage: string;
      label: string;
      failureCode: string;
      message: string;
    }>;
  };
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
  route?: string;
  reasoningEffort?: string | null;
  humanApprovalRequired?: boolean;
  riskScore?: number | null;
  riskDecision?: "auto-approve" | "human-review" | "block" | null;
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
  reasoningModel: string | null;
  reasoningEffort: string | null;
};

export type ExperimentRoute = {
  id: string;
  segment: string;
  riskLevels: string[];
  modelEnvironment: string;
  defaultModel: string;
  reasoningEffort: string | null;
  humanApproval: boolean;
  optimizationTarget: string;
};

export type ExperimentDescriptor = {
  id: string;
  name: string;
  hypothesis: string;
  businessScenario: string;
  routes: ExperimentRoute[];
  scoreBands?: Array<{
    id: string;
    range: string;
    label: string;
    action: string;
  }>;
  riskSignals?: Array<{
    id: string;
    label: string;
    weight: number;
  }>;
  decisionMetrics: string[];
  releaseSuite: string;
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
  releaseDecision?: ReleaseDecision;
  artifacts: { directory: string };
};

export type ReleaseDecision = {
  status: "go" | "no-go" | "insufficient-data";
  decidedAt: string;
  checks: Array<{
    id: string;
    label: string;
    status: "passed" | "failed" | "missing";
    actual: boolean | number | null;
    target: boolean | number;
    unit: "boolean" | "ratio" | "count" | "ms" | "usd";
  }>;
  blockedBy: string[];
  metrics: {
    passRate: number;
    safetyViolations: number;
    averageLatencyMs: number | null;
    totalEstimatedCostUsd: number | null;
    costPerPassedRunUsd: number | null;
    pricedCallRate: number | null;
  };
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
