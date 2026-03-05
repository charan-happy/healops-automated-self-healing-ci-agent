// ─── Vector Memory Service ──────────────────────────────────────────────────
// Stores and retrieves fix patterns using pgvector embeddings.
// Used by the agent to find similar past fixes (RAG).
//
// Edge cases handled:
// - Dedup by context_hash (error snippet + language + failure type)
// - Usage count increment on retrieval for analytics
// - Soft-delete cleanup for old unused entries
// - Filters out soft-deleted entries in similarity search

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VectorMemoryRepository } from '@db/repositories/healops/vector-memory.repository';
import { hashContext } from '@common/utils/hash';

export interface StoreFixInput {
  repositoryId: string;
  failureType: string;
  language: string;
  errorSnippet: string;
  fixDiff: string;
  confidence: number;
  embedding: number[];
  jobId: string;
}

export interface SimilarFix {
  id: string;
  failureType: string;
  language: string;
  fixDiff: string;
  confidence: number;
  similarity: number;
  usageCount: number;
}

@Injectable()
export class VectorMemoryService {
  private readonly logger = new Logger(VectorMemoryService.name);

  /** Default cleanup: entries older than 90 days with zero usage */
  private static readonly CLEANUP_DAYS = 90;

  constructor(
    private readonly configService: ConfigService,
    private readonly vectorMemoryRepository: VectorMemoryRepository,
  ) {}

  /**
   * Store a fix pattern in vector memory for future RAG retrieval.
   * Non-fatal: if storage fails, the successful fix still goes through
   * (PR is created), we just lose the learning opportunity.
   */
  async storeFix(input: StoreFixInput): Promise<void> {
    try {
      const contextHash = hashContext(
        input.errorSnippet,
        input.language,
        input.failureType,
      );

      // Check if similar context already exists
      const existing = await this.vectorMemoryRepository.findByContextHash(contextHash);
      if (existing) {
        this.logger.debug(`Vector memory entry already exists: ${contextHash}`);
        return;
      }

      await this.vectorMemoryRepository.createEntry({
        repositoryId: input.repositoryId,
        failureType: input.failureType,
        language: input.language,
        successfulPatch: input.fixDiff,
        confidence: input.confidence,
        errorEmbedding: input.embedding,
        contextHash,
        jobId: input.jobId,
      });

      this.logger.debug(`Stored fix pattern in vector memory: ${contextHash}`);
    } catch (error) {
      // Non-fatal: the PR was already created successfully.
      // We just can't learn from this fix for future RAG retrieval.
      this.logger.warn(
        `Failed to store fix in vector memory (non-fatal): ${(error as Error).message}`,
      );
    }
  }

  /**
   * Find similar past fixes using cosine similarity search.
   * Increments usage_count on retrieved (non-excluded) entries for analytics.
   *
   * Supports optional excludeIds to filter out fixes already tried in previous
   * attempts (prevents the agent from reusing failed approaches).
   *
   * Non-fatal: if vector search fails, returns empty results instead of
   * crashing the repair pipeline. RAG is an enhancement, not a requirement.
   */
  async findSimilarFixes(
    embedding: number[],
    limit: number = 3,
    options?: { excludeIds?: string[]; minSimilarity?: number },
  ): Promise<{
    fixes: SimilarFix[];
    excludedFixes: SimilarFix[];
    allRetrievedIds: string[];
  }> {
    const emptyResult = { fixes: [], excludedFixes: [], allRetrievedIds: [] };
    try {
      const minSimilarity = options?.minSimilarity ?? Number(
        this.configService.get<string>('AGENT_VECTOR_MIN_SIMILARITY') ?? '0.7',
      );
      const excludeIds = options?.excludeIds ?? [];

      // Fetch extra results to account for exclusions
      const fetchLimit = limit + excludeIds.length;

      const results = await this.vectorMemoryRepository.findSimilar(
        embedding,
        fetchLimit,
        minSimilarity,
      );

      if (results.length === 0) return emptyResult;

      const allFixes: SimilarFix[] = results.map((row) => ({
        id: String(row['id'] ?? ''),
        failureType: String(row['failure_type'] ?? ''),
        language: String(row['language'] ?? ''),
        fixDiff: String(row['successful_patch'] ?? ''),
        confidence: Number(row['confidence'] ?? 0),
        similarity: Number(row['similarity'] ?? 0),
        usageCount: Number(row['usage_count'] ?? 0),
      }));

      const allRetrievedIds = allFixes.map((f) => f.id);
      const excludeSet = new Set(excludeIds);

      // Partition into usable and excluded
      const fixes: SimilarFix[] = [];
      const excludedFixes: SimilarFix[] = [];
      for (const fix of allFixes) {
        if (excludeSet.has(fix.id)) {
          excludedFixes.push(fix);
        } else if (fixes.length < limit) {
          fixes.push(fix);
        }
      }

      // Increment usage count only for usable entries (fire-and-forget)
      for (const fix of fixes) {
        if (fix.id) {
          this.vectorMemoryRepository.incrementUsageCount(fix.id).catch((err) => {
            this.logger.warn(
              `Failed to increment usage count for ${fix.id}: ${(err as Error).message}`,
            );
          });
        }
      }

      return { fixes, excludedFixes, allRetrievedIds };
    } catch (error) {
      this.logger.warn(
        `Vector memory search failed (non-fatal, continuing without RAG): ${(error as Error).message}`,
      );
      return emptyResult;
    }
  }

  /**
   * Soft-delete old, unused vector memory entries.
   * Cleans up entries that are older than CLEANUP_DAYS with zero usage,
   * or entries whose last_used_at is older than CLEANUP_DAYS.
   *
   * Returns the number of entries soft-deleted.
   */
  async cleanupOldMemories(repositoryId?: string): Promise<number> {
    const days = Number(
      this.configService.get<string>('AGENT_VECTOR_CLEANUP_DAYS') ??
        String(VectorMemoryService.CLEANUP_DAYS),
    );
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const count = await this.vectorMemoryRepository.softDeleteOldEntries(cutoffDate, repositoryId);

    if (count > 0) {
      this.logger.log(`Cleaned up ${String(count)} old vector memory entries (cutoff: ${cutoffDate.toISOString()})`);
    }

    return count;
  }
}
