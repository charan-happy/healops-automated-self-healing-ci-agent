// ─── Vector Memory Repository ───────────────────────────────────────────────
// Data access for: vector_memory (pgvector)

import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { vectorMemory } from '../../schema/intelligence';
import { eq, sql, desc, and, isNull } from 'drizzle-orm';

@Injectable()
export class VectorMemoryRepository {
  constructor(private readonly dbService: DBService) {}

  async createEntry(data: typeof vectorMemory.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(vectorMemory)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  async findByContextHash(contextHash: string) {
    const [row] = await this.dbService.db
      .select()
      .from(vectorMemory)
      .where(eq(vectorMemory.contextHash, contextHash));
    return row ?? null;
  }

  /**
   * Find similar error patterns using cosine similarity.
   * Requires pgvector extension and HNSW index.
   *
   * The embedding is passed as a parameterized JSON string to prevent SQL injection.
   */
  async findSimilar(
    embedding: number[],
    limit: number,
    minSimilarity: number,
  ): Promise<Record<string, unknown>[]> {
    // Safely serialize as JSON string and bind as a parameter (not interpolated into SQL)
    const embeddingJson = JSON.stringify(embedding);
    const result = await this.dbService.db.execute(sql`
      SELECT
        id,
        failure_type,
        language,
        successful_patch,
        confidence,
        context_hash,
        usage_count,
        1 - (error_embedding <=> ${embeddingJson}::vector) AS similarity
      FROM vector_memory
      WHERE deleted_at IS NULL
        AND 1 - (error_embedding <=> ${embeddingJson}::vector) > ${minSimilarity}
      ORDER BY error_embedding <=> ${embeddingJson}::vector
      LIMIT ${limit}
    `);
    // db.execute() returns QueryResult — extract .rows for a plain array
    const rows = (result as unknown as { rows: Record<string, unknown>[] }).rows;
    return rows ?? [];
  }

  async incrementUsageCount(id: string) {
    const [row] = await this.dbService.db
      .update(vectorMemory)
      .set({
        usageCount: sql`${vectorMemory.usageCount} + 1`,
        lastUsedAt: sql`now()`,
      })
      .where(eq(vectorMemory.id, id))
      .returning();
    return row ?? null;
  }

  async findRecentEntries(limit: number) {
    return this.dbService.db
      .select()
      .from(vectorMemory)
      .orderBy(desc(vectorMemory.createdAt))
      .limit(limit);
  }

  /**
   * Soft-delete old, unused vector memory entries.
   * Entries are eligible if:
   * - usage_count = 0 AND created_at < cutoffDate
   * - OR last_used_at < cutoffDate (stale even if used once)
   * Only targets entries not already soft-deleted.
   */
  async softDeleteOldEntries(cutoffDate: Date, repositoryId?: string): Promise<number> {
    // Pass cutoffDate as a bound parameter — Drizzle's sql`` handles Date objects safely
    const conditions = [
      isNull(vectorMemory.deletedAt),
      sql`(
        (${vectorMemory.usageCount} = 0 AND ${vectorMemory.createdAt} < ${cutoffDate})
        OR (${vectorMemory.lastUsedAt} IS NOT NULL AND ${vectorMemory.lastUsedAt} < ${cutoffDate})
      )`,
    ];
    if (repositoryId) {
      conditions.push(eq(vectorMemory.repositoryId, repositoryId));
    }
    const result = await this.dbService.db
      .update(vectorMemory)
      .set({ deletedAt: sql`now()` })
      .where(and(...conditions))
      .returning({ id: vectorMemory.id });
    return result.length;
  }
}
