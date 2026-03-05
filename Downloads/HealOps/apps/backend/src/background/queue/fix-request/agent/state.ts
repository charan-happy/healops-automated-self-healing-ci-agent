// ─── Fix Agent State ────────────────────────────────────────────────────────
// LangGraph state definition for the AI fix agent.

import { Annotation } from '@langchain/langgraph';

// ─── Supporting interfaces ─────────────────────────────────────────────────

export interface SimilarFixEntry {
  id: string;
  patch: string;
  errorType: string;
  confidence: number;
  similarity: number;
}

export interface SearchResultRecord {
  fixId: string;
  similarity: number;
  errorType: string;
  wasUsed: boolean;
  wasExcluded: boolean;
}

export interface AttemptRecord {
  attemptNumber: number;
  fixedCode: string;
  fixSummary: string;
  fixConfidence: number;
  isCorrect: boolean;
  evaluationFeedback: string;
  inputTokens: number;
  outputTokens: number;
  searchResults: SearchResultRecord[];
  usedSimilarFixIds: string[];
  discardedSimilarFixIds: string[];
  aiReasoning: string;
  rejectionReason: string;
  approachDescription: string;
}

export interface AgentLogEntry {
  timestamp: string;
  step: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// ─── LangGraph Annotation ──────────────────────────────────────────────────

export const FixGraphAnnotation = Annotation.Root({
  // ── Inputs (set once at invocation) ──────────────────────────────────────
  errorMessage: Annotation<string>,
  codeSnippet: Annotation<string>,
  lineNumber: Annotation<number>,
  filePath: Annotation<string>,
  language: Annotation<string>,
  branch: Annotation<string>,
  commitSha: Annotation<string>,
  fixRequestId: Annotation<string>,

  // ── Classification (set by classify node) ────────────────────────────────
  classifiedErrorType: Annotation<string>,
  classificationConfidence: Annotation<number>,
  isInScope: Annotation<boolean>,
  scopeReason: Annotation<string>,

  // ── Similar fixes (set by search_similar node) ───────────────────────────
  similarFixes: Annotation<SimilarFixEntry[]>({
    reducer: (_curr, update) => update,
    default: () => [],
  }),

  // ── Similar fix tracking (accumulated across attempts) ─────────────────
  usedSimilarFixIds: Annotation<string[]>({
    reducer: (curr, update) => [...new Set([...curr, ...update])],
    default: () => [],
  }),
  searchResultsPerAttempt: Annotation<SearchResultRecord[][]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),
  currentApproach: Annotation<string>({
    reducer: (_curr, update) => update,
    default: () => '',
  }),
  currentReasoning: Annotation<string>({
    reducer: (_curr, update) => update,
    default: () => '',
  }),

  // ── Attempt tracking ─────────────────────────────────────────────────────
  currentAttempt: Annotation<number>({
    reducer: (_curr, update) => update,
    default: () => 0,
  }),
  maxAttempts: Annotation<number>({
    reducer: (_curr, update) => update,
    default: () => 3,
  }),

  // ── Current fix (updated per attempt by generate_fix node) ───────────────
  fixSummary: Annotation<string>,
  fixedCode: Annotation<string>,
  fixConfidence: Annotation<number>,
  fixExplanation: Annotation<string>,

  // ── Evaluation (updated per attempt by evaluate_fix node) ────────────────
  isFixCorrect: Annotation<boolean>,
  evaluationFeedback: Annotation<string>,

  // ── Accumulating state ───────────────────────────────────────────────────
  previousAttempts: Annotation<AttemptRecord[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),

  totalInputTokens: Annotation<number>({
    reducer: (curr, update) => curr + update,
    default: () => 0,
  }),

  totalOutputTokens: Annotation<number>({
    reducer: (curr, update) => curr + update,
    default: () => 0,
  }),

  totalTokensUsed: Annotation<number>({
    reducer: (curr, update) => curr + update,
    default: () => 0,
  }),

  logs: Annotation<AgentLogEntry[]>({
    reducer: (curr, update) => [...curr, ...update],
    default: () => [],
  }),

  // ── Final outcome (set at the end) ───────────────────────────────────────
  finalStatus: Annotation<string>({
    reducer: (_curr, update) => update,
    default: () => 'pending',
  }),
});

export type FixGraphState = typeof FixGraphAnnotation.State;
