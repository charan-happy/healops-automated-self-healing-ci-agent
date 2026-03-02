// ─── Fix Graph ──────────────────────────────────────────────────────────────
// LangGraph state machine for the AI fix flow.
//
// Flow:
//   START → classify → scope_check ──(out_of_scope)──→ END
//                          │
//                      (in_scope)
//                          │
//                          ↓
//                   search_similar → generate_fix → evaluate_fix → decide
//                        ↑                                          │
//                        └──────────(retry)──────────────────────────┘
//                                                                   │
//                                                                (done)
//                                                                   ↓
//                                                                  END

import type { AiService } from '@ai/ai.service';
import { END, START, StateGraph } from '@langchain/langgraph';

import {
  type AttemptRecord,
  FixGraphAnnotation,
  type FixGraphState,
  type SearchResultRecord,
} from './state';

import type { ErrorClassifierService } from '../services/error-classifier.service';
import type { SimilarFixService } from '../services/similar-fix.service';
import { buildFixSystemPrompt, buildFixUserPrompt } from '../constants/fix-prompts.constant';

/**
 * Strip markdown code fences (```json ... ```) that some LLMs wrap around JSON responses.
 */
function stripMarkdownFences(text: string): string {
  const fenced = text.match(/```(?:\w*)\s*\n?([\s\S]*?)\n?\s*```/);
  return fenced ? fenced[1]!.trim() : text.trim();
}

// ─── Graph builder ─────────────────────────────────────────────────────────
// Services are passed as parameters so LangGraph nodes (pure functions)
// can access NestJS-injected dependencies via closure.

export interface FixGraphDeps {
  aiService: AiService;
  classifierService: ErrorClassifierService;
  similarFixService: SimilarFixService;
  maxAttempts: number;
  minConfidence: number;
  similarityThreshold: number;
  /** Similarity threshold above which a cached fix is applied directly (skips LLM generation + evaluation). */
  highSimilarityThreshold: number;
  onAuditLog: (action: string, metadata: Record<string, unknown>) => Promise<void>;
}

export function buildFixGraph(deps: FixGraphDeps) {
  // ── Node: classify ──────────────────────────────────────────────────────
  const classifyNode = async (state: FixGraphState) => {
    const classification = await deps.classifierService.classify(
      state.errorMessage,
      state.codeSnippet,
      state.filePath,
      state.language
    );

    return {
      classifiedErrorType: classification.errorType,
      classificationConfidence: classification.confidence,
      isInScope: classification.isInScope,
      scopeReason: classification.scopeReason,
      totalInputTokens: classification.inputTokens,
      totalOutputTokens: classification.outputTokens,
      totalTokensUsed: classification.totalTokens,
      logs: [
        {
          timestamp: new Date().toISOString(),
          step: 'classify',
          message: `Classified as ${classification.errorType} (confidence: ${String(Math.round(classification.confidence * 100))}%)`,
          metadata: {
            errorType: classification.errorType,
            category: classification.category,
            confidence: classification.confidence,
          },
        },
      ],
    };
  };

  // ── Node: search_similar ────────────────────────────────────────────────
  const searchSimilarNode = async (state: FixGraphState) => {
    const language = state.language || 'typescript';
    const { fixes, excludedFixes, allRetrievedIds, tokensUsed } =
      await deps.similarFixService.findSimilarFixes(
        state.errorMessage,
        state.classifiedErrorType,
        language,
        5,
        deps.similarityThreshold,
        state.usedSimilarFixIds
      );

    // Build search result records for this attempt
    const searchResults: SearchResultRecord[] = [
      ...fixes.map(f => ({
        fixId: f.id,
        similarity: f.similarity,
        errorType: f.errorType,
        wasUsed: true,
        wasExcluded: false,
      })),
      ...excludedFixes.map(f => ({
        fixId: f.id,
        similarity: f.similarity,
        errorType: f.errorType,
        wasUsed: false,
        wasExcluded: true,
      })),
    ];

    await deps.onAuditLog('search_similar', {
      attemptNumber: state.currentAttempt + 1,
      totalRetrieved: allRetrievedIds.length,
      usableCount: fixes.length,
      excludedCount: excludedFixes.length,
      excludedIds: excludedFixes.map(f => f.id),
      topSimilarity: fixes[0]?.similarity ?? 0,
      allRetrievedIds,
    });

    return {
      similarFixes: fixes,
      searchResultsPerAttempt: [searchResults],
      totalTokensUsed: tokensUsed,
      logs: [
        {
          timestamp: new Date().toISOString(),
          step: 'search_similar',
          message: `Found ${String(fixes.length)} usable / ${String(excludedFixes.length)} excluded similar fix(es)`,
          metadata: {
            usableCount: fixes.length,
            excludedCount: excludedFixes.length,
            topSimilarity: fixes[0]?.similarity ?? 0,
          },
        },
      ],
    };
  };

  // ── Node: apply_cached_fix ─────────────────────────────────────────────
  // Short-circuit: when search_similar finds a very high similarity match,
  // apply the stored fix directly — no LLM generation or evaluation needed.
  const applyCachedFixNode = async (state: FixGraphState) => {
    const topFix = state.similarFixes[0]!;
    const attemptNum = state.currentAttempt + 1;
    const usedIdsThisAttempt = [topFix.id];

    const latestSearchResults =
      state.searchResultsPerAttempt[state.searchResultsPerAttempt.length - 1] ?? [];

    const summary = `Applied cached fix from vector memory (similarity: ${String(Math.round(topFix.similarity * 100))}%)`;
    const feedback = `High-similarity match (${String(Math.round(topFix.similarity * 100))}%) — applied directly from vector memory, 0 tokens used`;

    const attemptRecord: AttemptRecord = {
      attemptNumber: attemptNum,
      fixedCode: topFix.patch,
      fixSummary: summary,
      fixConfidence: topFix.confidence,
      isCorrect: true,
      evaluationFeedback: feedback,
      inputTokens: 0,
      outputTokens: 0,
      searchResults: latestSearchResults,
      usedSimilarFixIds: usedIdsThisAttempt,
      discardedSimilarFixIds: [],
      aiReasoning: `Exact match found in vector memory with ${String(Math.round(topFix.similarity * 100))}% similarity. No LLM generation needed.`,
      rejectionReason: '',
      approachDescription: 'cached_fix_application',
    };

    await deps.onAuditLog('apply_cached_fix', {
      attemptNumber: attemptNum,
      similarFixId: topFix.id,
      similarity: topFix.similarity,
      confidence: topFix.confidence,
      tokensUsed: 0,
    });

    return {
      currentAttempt: attemptNum,
      fixSummary: summary,
      fixedCode: topFix.patch,
      fixConfidence: topFix.confidence,
      fixExplanation: feedback,
      currentApproach: 'cached_fix_application',
      currentReasoning: attemptRecord.aiReasoning,
      usedSimilarFixIds: usedIdsThisAttempt,
      isFixCorrect: true,
      evaluationFeedback: feedback,
      previousAttempts: [attemptRecord],
      logs: [
        {
          timestamp: new Date().toISOString(),
          step: 'apply_cached_fix',
          message: `Applied cached fix (similarity: ${String(Math.round(topFix.similarity * 100))}%, confidence: ${String(Math.round(topFix.confidence * 100))}%) — 0 tokens used`,
          metadata: {
            similarFixId: topFix.id,
            similarity: topFix.similarity,
            confidence: topFix.confidence,
          },
        },
      ],
    };
  };

  // ── Node: generate_fix ──────────────────────────────────────────────────
  // The LLM sees a numbered code window for context but outputs ONLY the
  // specific line(s) it wants to change. The processor then splices those
  // lines into the original file. This makes it impossible for the LLM to
  // accidentally delete unrelated code.
  const generateFixNode = async (state: FixGraphState) => {
    const attemptNum = state.currentAttempt + 1;
    const usedIdsThisAttempt = state.similarFixes.slice(0, 3).map(f => f.id);

    // Calculate the window start line so the user prompt shows correct line numbers.
    // This must match the enrichWithSourceCode() calculation: max(0, errorIdx - 15) + 1
    const windowStartLine = Math.max(1, state.lineNumber - 15);

    const response = await deps.aiService.structuredOutput({
      messages: [
        {
          role: 'system' as const,
          content: buildFixSystemPrompt(state.classifiedErrorType, state.language),
        },
        {
          role: 'user' as const,
          content: buildFixUserPrompt({
            errorType: state.classifiedErrorType,
            errorMessage: state.errorMessage,
            lineNumber: state.lineNumber,
            filePath: state.filePath,
            language: state.language,
            codeSnippet: state.codeSnippet,
            windowStartLine,
          }),
        },
      ],
      schema: {
        type: 'object',
        properties: {
          thinking: {
            type: 'string',
            description:
              'Step-by-step: (1) What exact error? (2) Which line number? (3) What minimal change fixes it?',
          },
          fixes: {
            type: 'array',
            description: 'Array of line-level fixes. Usually 1-2 entries.',
            items: {
              type: 'object',
              properties: {
                action: {
                  type: 'string',
                  enum: ['replace', 'insert_after'],
                  description: '"replace" to change an existing line, "insert_after" to add a new line after the specified lineNumber',
                },
                lineNumber: {
                  type: 'number',
                  description: 'For replace: the line to replace. For insert_after: the new line is inserted AFTER this line (use 0 for top of file)',
                },
                originalLine: {
                  type: 'string',
                  description: 'For replace: the EXACT current content of the line (copied from code window). For insert_after: empty string ""',
                },
                fixedLine: {
                  type: 'string',
                  description: 'The corrected/new line content (preserve indentation)',
                },
              },
              required: ['action', 'lineNumber', 'originalLine', 'fixedLine'],
            },
          },
          summary: {
            type: 'string',
            description: 'One sentence: what changed (e.g. "Wrapped user.id with Number() on line 52")',
          },
          confidence: {
            type: 'number',
            description: 'Confidence 0-1. 0.8+ for clear fixes.',
          },
        },
        required: ['thinking', 'fixes', 'summary', 'confidence'],
      },
      schemaName: 'FixGeneration',
    });

    let summary = '';
    let fixedCode = '';
    let confidence = 0;
    let thinking = '';
    let fixCount = 0;

    try {
      const parsed = JSON.parse(stripMarkdownFences(response.data.content)) as Record<string, unknown>;
      thinking = typeof parsed['thinking'] === 'string' ? parsed['thinking'] : '';
      summary = typeof parsed['summary'] === 'string' ? parsed['summary'] : '';
      confidence = Number(parsed['confidence'] ?? 0);

      // Parse the line-level fixes and encode them as JSON for the processor
      const fixes = Array.isArray(parsed['fixes']) ? parsed['fixes'] as Array<Record<string, unknown>> : [];
      fixCount = fixes.length;

      if (fixes.length > 0) {
        // Encode as line-fix JSON so the processor can apply surgically
        fixedCode = JSON.stringify(
          fixes.map(f => ({
            action: typeof f['action'] === 'string' ? f['action'] : 'replace',
            lineNumber: Number(f['lineNumber'] ?? 0),
            originalLine: typeof f['originalLine'] === 'string' ? f['originalLine'] : '',
            fixedLine: typeof f['fixedLine'] === 'string' ? f['fixedLine'] : '',
          })),
        );
      }
    } catch {
      summary = 'Failed to parse fix response';
      fixedCode = '';
      confidence = 0;
      thinking = response.data.content.slice(0, 500);
    }

    await deps.onAuditLog('generate_fix', {
      attemptNumber: attemptNum,
      thinking,
      usedSimilarFixIds: usedIdsThisAttempt,
      discardedSimilarFixIds: state.usedSimilarFixIds,
      confidence,
      summary,
      fixCount,
    });

    // Auto-accept high-confidence fixes
    const autoAccepted = confidence >= 0.7 && fixedCode.length > 0;

    return {
      currentAttempt: attemptNum,
      fixSummary: summary,
      fixedCode,
      fixConfidence: confidence,
      fixExplanation: thinking,
      currentApproach: summary,
      currentReasoning: thinking,
      usedSimilarFixIds: usedIdsThisAttempt,
      // Mark as correct when auto-accepted so downstream treats it as accepted
      ...(autoAccepted ? { isFixCorrect: true, evaluationFeedback: 'Auto-accepted (high confidence)' } : {}),
      totalInputTokens: response.usage.promptTokens,
      totalOutputTokens: response.usage.completionTokens,
      totalTokensUsed: response.usage.totalTokens,
      logs: [
        {
          timestamp: new Date().toISOString(),
          step: 'generate_fix',
          message: `Attempt ${String(attemptNum)}: "${summary}" (confidence: ${String(Math.round(confidence * 100))}%, ${String(fixCount)} line fix(es))${autoAccepted ? ' — AUTO-ACCEPTED' : ''}`,
          metadata: {
            attemptNumber: attemptNum,
            summary,
            confidence,
            fixCount,
            thinking,
            autoAccepted,
            usedSimilarFixIds: usedIdsThisAttempt,
            fixedCodeLength: fixedCode.length,
          },
        },
      ],
    };
  };

  // ── Node: evaluate_fix ──────────────────────────────────────────────────
  const evaluateFixNode = async (state: FixGraphState) => {
    const response = await deps.aiService.structuredOutput({
      messages: [
        {
          role: 'user' as const,
          content: [
            'You are a code reviewer. Evaluate whether the proposed fix correctly resolves the error.',
            '',
            '## Original Error',
            `Error: ${state.errorMessage}`,
            `Error type: ${state.classifiedErrorType}`,
            state.filePath ? `File: ${state.filePath}` : '',
            state.language ? `Language: ${state.language}` : '',
            '',
            '## Original Code (with error)',
            '```',
            state.codeSnippet,
            '```',
            '',
            '## Proposed Fix',
            '```',
            state.fixedCode,
            '```',
            '',
            '## Fix Explanation',
            state.fixExplanation,
            '',
            'Evaluate: Does this fix correctly resolve the original error? Is the code syntactically valid? Does it introduce any new issues?',
          ]
            .filter(Boolean)
            .join('\n'),
        },
      ],
      schema: {
        type: 'object',
        properties: {
          is_correct: {
            type: 'boolean',
            description:
              'Whether the fix correctly resolves the error without introducing new issues',
          },
          confidence: {
            type: 'number',
            description: 'Confidence in the evaluation (0-1)',
          },
          feedback: {
            type: 'string',
            description: 'Detailed feedback — what is good, what is wrong, what could be improved',
          },
        },
        required: ['is_correct', 'confidence', 'feedback'],
      },
      schemaName: 'FixEvaluation',
    });

    let isCorrect = false;
    let feedback = '';

    try {
      const parsed = JSON.parse(stripMarkdownFences(response.data.content)) as Record<string, unknown>;
      isCorrect = Boolean(parsed['is_correct']);
      feedback = typeof parsed['feedback'] === 'string' ? parsed['feedback'] : '';
    } catch {
      feedback = 'Failed to parse evaluation response';
    }

    // If the fix confidence is high enough AND evaluation says it's correct → accept
    const accepted = isCorrect && state.fixConfidence >= deps.minConfidence;
    const rejectionReason = accepted ? '' : feedback;

    // Determine which search results belong to this attempt
    const latestSearchResults =
      state.searchResultsPerAttempt[state.searchResultsPerAttempt.length - 1] ?? [];

    // IDs used in the prompt this attempt
    const usedIdsThisAttempt = state.similarFixes.slice(0, 3).map(f => f.id);

    // IDs that were excluded this attempt (from search results marked as excluded)
    const discardedIdsThisAttempt = latestSearchResults
      .filter(r => r.wasExcluded)
      .map(r => r.fixId);

    const attemptRecord: AttemptRecord = {
      attemptNumber: state.currentAttempt,
      fixedCode: state.fixedCode,
      fixSummary: state.fixSummary,
      fixConfidence: state.fixConfidence,
      isCorrect: accepted,
      evaluationFeedback: feedback,
      inputTokens: response.usage.promptTokens,
      outputTokens: response.usage.completionTokens,
      searchResults: latestSearchResults,
      usedSimilarFixIds: usedIdsThisAttempt,
      discardedSimilarFixIds: discardedIdsThisAttempt,
      aiReasoning: state.currentReasoning,
      rejectionReason,
      approachDescription: state.currentApproach,
    };

    await deps.onAuditLog('evaluate_fix', {
      attemptNumber: state.currentAttempt,
      accepted,
      isCorrect,
      fixConfidence: state.fixConfidence,
      rejectionReason,
      approach: state.currentApproach,
      usedSimilarFixIds: usedIdsThisAttempt,
      discardedSimilarFixIds: discardedIdsThisAttempt,
      searchResultCount: latestSearchResults.length,
    });

    return {
      isFixCorrect: accepted,
      evaluationFeedback: feedback,
      previousAttempts: [attemptRecord],
      totalInputTokens: response.usage.promptTokens,
      totalOutputTokens: response.usage.completionTokens,
      totalTokensUsed: response.usage.totalTokens,
      logs: [
        {
          timestamp: new Date().toISOString(),
          step: 'evaluate_fix',
          message: `Attempt ${String(state.currentAttempt)} evaluation: ${accepted ? 'ACCEPTED' : 'REJECTED'} — ${feedback.slice(0, 200)}`,
          metadata: {
            attemptNumber: state.currentAttempt,
            isCorrect,
            accepted,
            fixConfidence: state.fixConfidence,
            rejectionReason,
            approach: state.currentApproach,
          },
        },
      ],
    };
  };

  // ── Conditional edges ───────────────────────────────────────────────────

  const scopeRouter = (state: FixGraphState): string => {
    if (!state.isInScope) {
      return END;
    }
    return 'search_similar';
  };

  const similarityRouter = (state: FixGraphState): string => {
    const topFix = state.similarFixes[0];
    if (
      topFix &&
      topFix.similarity >= deps.highSimilarityThreshold &&
      topFix.confidence >= deps.minConfidence
    ) {
      // Sanity check: the cached patch must share significant content with
      // the current code snippet. Without this, a cached fix from a completely
      // different file (e.g. rag.service.ts) could be applied to auth.controller.ts.
      const norm = (l: string) => l.trim().replace(/\s+/g, ' ');
      const currentLines = new Set(state.codeSnippet.split('\n').map(norm).filter(Boolean));
      const patchLines = topFix.patch.split('\n').map(norm).filter(Boolean);
      const overlap = patchLines.filter((l) => currentLines.has(l)).length;
      const overlapRatio = currentLines.size > 0 ? overlap / currentLines.size : 0;
      if (overlapRatio >= 0.3) {
        return 'apply_cached_fix';
      }
      // Cached fix is from a different file/context — skip to LLM generation
    }
    return 'generate_fix';
  };

  // ── Conditional edge after generate_fix ────────────────────────────
  // High-confidence fixes are auto-accepted — no evaluation LLM call needed.
  const postGenerateRouter = (state: FixGraphState): string => {
    if (state.fixConfidence >= 0.7 && state.fixedCode.length > 0) {
      return END;
    }
    return 'evaluate_fix';
  };

  const retryRouter = (state: FixGraphState): string => {
    if (state.isFixCorrect) {
      return END;
    }
    if (state.currentAttempt < state.maxAttempts) {
      // Re-route through search_similar so retries get fresh results with exclusions
      return 'search_similar';
    }
    return END;
  };

  // ── Build graph ─────────────────────────────────────────────────────────

  const graph = new StateGraph(FixGraphAnnotation)
    .addNode('classify', classifyNode)
    .addNode('search_similar', searchSimilarNode)
    .addNode('apply_cached_fix', applyCachedFixNode)
    .addNode('generate_fix', generateFixNode)
    .addNode('evaluate_fix', evaluateFixNode)
    .addEdge(START, 'classify')
    .addConditionalEdges('classify', scopeRouter, ['search_similar', END])
    .addConditionalEdges('search_similar', similarityRouter, ['apply_cached_fix', 'generate_fix'])
    .addEdge('apply_cached_fix', END)
    .addConditionalEdges('generate_fix', postGenerateRouter, ['evaluate_fix', END])
    .addConditionalEdges('evaluate_fix', retryRouter, ['search_similar', END]);

  return graph.compile();
}
