// ─── Failures Repository ────────────────────────────────────────────────────
// Data access for: failures, flaky_failure_registry, error_types

import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { failures, flakyFailureRegistry } from '../../schema/analysis';
import { errorTypes } from '../../schema/ingestion';
import { eq, and, sql, desc } from 'drizzle-orm';

@Injectable()
export class FailuresRepository {
  constructor(private readonly dbService: DBService) {}

  // ─── Failures ──────────────────────────────────────────────────────────

  async createFailure(data: typeof failures.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(failures)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create failure');
    return row;
  }

  async findFailureById(id: string) {
    const [row] = await this.dbService.db
      .select()
      .from(failures)
      .where(eq(failures.id, id));
    return row ?? null;
  }

  async findFailuresByPipelineRun(pipelineRunId: string) {
    return this.dbService.db
      .select()
      .from(failures)
      .where(eq(failures.pipelineRunId, pipelineRunId));
  }

  async findFailureByErrorHash(errorHash: string) {
    const [row] = await this.dbService.db
      .select()
      .from(failures)
      .where(eq(failures.errorHash, errorHash))
      .orderBy(desc(failures.detectedAt))
      .limit(1);
    return row ?? null;
  }

  // ─── Flaky Failure Registry ────────────────────────────────────────────

  async upsertFlakyRegistry(
    repositoryId: string,
    errorHash: string,
  ) {
    const [row] = await this.dbService.db
      .insert(flakyFailureRegistry)
      .values({
        repositoryId,
        errorHash,
        occurrenceCount: 1,
        distinctCommits: 1,
      })
      .onConflictDoUpdate({
        target: [flakyFailureRegistry.repositoryId, flakyFailureRegistry.errorHash],
        set: {
          occurrenceCount: sql`${flakyFailureRegistry.occurrenceCount} + 1`,
          distinctCommits: sql`${flakyFailureRegistry.distinctCommits} + 1`,
          lastSeenAt: sql`now()`,
        },
      })
      .returning();
    return row ?? null;
  }

  async findFlakyByErrorHash(repositoryId: string, errorHash: string) {
    const [row] = await this.dbService.db
      .select()
      .from(flakyFailureRegistry)
      .where(
        and(
          eq(flakyFailureRegistry.repositoryId, repositoryId),
          eq(flakyFailureRegistry.errorHash, errorHash),
        ),
      );
    return row ?? null;
  }

  async isFlakyConfirmed(repositoryId: string, errorHash: string): Promise<boolean> {
    const row = await this.findFlakyByErrorHash(repositoryId, errorHash);
    if (!row) return false;
    return row.flakyConfirmed;
  }

  // ─── Error Types ───────────────────────────────────────────────────────

  async findErrorTypeByCode(code: string) {
    const [row] = await this.dbService.db
      .select()
      .from(errorTypes)
      .where(eq(errorTypes.code, code));
    return row ?? null;
  }

  async findAllErrorTypes() {
    return this.dbService.db.select().from(errorTypes);
  }
}
