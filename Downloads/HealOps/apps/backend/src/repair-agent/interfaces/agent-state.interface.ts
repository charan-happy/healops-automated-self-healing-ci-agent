// ─── LangGraph Agent State Interface ────────────────────────────────────────
// Defines the state shape for the HealOps LangGraph StateGraph.

export interface PreviousAttempt {
  attemptNumber: number;
  diagnosis: string;
  fixStrategy: string;
  confidence: number;
  diffContent: string;
  validationError: string;
  stage: 'pre_check' | 'runner';
}

export interface ClaudeFixOutput {
  diagnosis: string;
  fix_strategy: string;
  confidence: number;
  can_fix: boolean;
  cannot_fix_reason: string;
  diff: string;
  files_modified: string[];
}

export interface PreCheckResult {
  passed: boolean;
  buildOutput: string;
  errorMessage: string;
}

export interface ValidationResult {
  status: 'success' | 'failure';
  runId: string;
  buildLog: string;
  testLog: string;
  coveragePercent: number | null;
  securityScanStatus: string | null;
}

export interface AgentState {
  jobId: string;
  failureId: string;
  repositoryId: string;
  attemptNumber: number;
  errorSnippet: string;
  affectedFile: string;
  language: string;
  errorTypeCode: string;
  fileContents: Record<string, string>;
  ragExamples: string[];
  previousAttempts: PreviousAttempt[];
  claudeOutput: ClaudeFixOutput | null;
  patchDiff: string | null;
  preCheckResult: PreCheckResult | null;
  validationResult: ValidationResult | null;
  finalStatus: 'success' | 'escalate' | 'retry';
}
