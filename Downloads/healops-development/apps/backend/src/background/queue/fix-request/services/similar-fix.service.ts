// ─── Similar Fix Service ────────────────────────────────────────────────────
// Searches vector_memory for similar past fixes using:
// 1. Error hash (exact match on failure_type — fast)
// 2. Embedding cosine similarity (semantic search — slower but finds related errors)

import { Injectable, Logger } from '@nestjs/common';
import { AiService } from '@ai/ai.service';
import { VectorMemoryRepository } from '@db/repositories/healops/vector-memory.repository';
import type { SimilarFixEntry } from '../agent/state';

@Injectable()
export class SimilarFixService {
  private readonly logger = new Logger(SimilarFixService.name);

  constructor(
    private readonly aiService: AiService,
    private readonly vectorMemoryRepo: VectorMemoryRepository,
  ) {}

  /**
   * Search for similar past fixes.
   * Strategy:
   *   1. Generate embedding of the error message
   *   2. Cosine similarity search in vector_memory (pgvector HNSW)
   *   3. Filter by minimum similarity threshold
   *   4. Partition into usable and excluded (based on excludeIds)
   */
  async findSimilarFixes(
    errorMessage: string,
    errorType: string,
    language: string,
    limit: number = 5,
    minSimilarity: number = 0.7,
    excludeIds: string[] = [],
  ): Promise<{
    fixes: SimilarFixEntry[];
    excludedFixes: SimilarFixEntry[];
    allRetrievedIds: string[];
    tokensUsed: number;
  }> {
    try {
      // Generate embedding for the error message
      const embeddingResponse = await this.aiService.embed({
        input: `${errorType}: ${errorMessage}`,
      });

      const embedding = embeddingResponse.data.embeddings[0];
      if (!embedding) {
        this.logger.warn('No embedding returned for error message');
        return {
          fixes: [],
          excludedFixes: [],
          allRetrievedIds: [],
          tokensUsed: embeddingResponse.usage.totalTokens,
        };
      }

      // Fetch more results to account for exclusions
      const fetchLimit = limit + excludeIds.length;

      // Search vector_memory using cosine similarity
      const results = await this.vectorMemoryRepo.findSimilar(
        embedding,
        fetchLimit,
        minSimilarity,
      );

      const allFixes: SimilarFixEntry[] = results.map((r) => ({
        id: String(r['id'] ?? ''),
        patch: String(r['successful_patch'] ?? ''),
        errorType: String(r['failure_type'] ?? ''),
        confidence: Number(r['confidence'] ?? 0),
        similarity: Number(r['similarity'] ?? 0),
      }));

      const allRetrievedIds = allFixes.map((f) => f.id);
      const excludeSet = new Set(excludeIds);

      // Partition into usable and excluded
      const fixes: SimilarFixEntry[] = [];
      const excludedFixes: SimilarFixEntry[] = [];
      for (const fix of allFixes) {
        if (excludeSet.has(fix.id)) {
          excludedFixes.push(fix);
        } else if (fixes.length < limit) {
          fixes.push(fix);
        }
      }

      this.logger.log(
        `Found ${String(fixes.length)} usable / ${String(excludedFixes.length)} excluded similar fix(es) for errorType=${errorType} language=${language}`,
      );

      // Increment usage count only for usable entries
      for (const fix of fixes) {
        await this.vectorMemoryRepo.incrementUsageCount(fix.id);
      }

      return {
        fixes,
        excludedFixes,
        allRetrievedIds,
        tokensUsed: embeddingResponse.usage.totalTokens,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Similar fix search failed: ${msg}`);
      return { fixes: [], excludedFixes: [], allRetrievedIds: [], tokensUsed: 0 };
    }
  }
}
