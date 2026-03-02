/** Represents a single step in the repair agent's thinking process. */
export interface AgentStep {
  stage: string;
  displayName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  details?: string;
}

/** Pipeline stage definitions with display names and icons. */
export const PIPELINE_STAGES: Array<{ stage: string; displayName: string }> = [
  { stage: 'gatherContext', displayName: 'Gathering Context' },
  { stage: 'classify', displayName: 'Classifying Error' },
  { stage: 'searchSimilar', displayName: 'Searching Similar Fixes' },
  { stage: 'generateFix', displayName: 'Generating Fix' },
  { stage: 'qualityGate', displayName: 'Quality Gate Check' },
  { stage: 'preCheck', displayName: 'Pre-Check Compilation' },
  { stage: 'pushBranch', displayName: 'Pushing Branch' },
  { stage: 'createPR', displayName: 'Creating Pull Request' },
];
