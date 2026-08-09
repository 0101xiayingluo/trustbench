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
};
