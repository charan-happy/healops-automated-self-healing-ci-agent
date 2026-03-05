// ─── Fix Requests Repository ────────────────────────────────────────────────
// Data access for: fix_requests

import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { fixRequests } from '../../schema/fix-requests';
import { eq, and, desc, sql } from 'drizzle-orm';

@Injectable()
export class FixRequestsRepository {
  constructor(private readonly dbService: DBService) {}

  async create(data: typeof fixRequests.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(fixRequests)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create fix request');
    return row;
  }

  async findById(id: string) {
    const [row] = await this.dbService.db
      .select()
      .from(fixRequests)
      .where(eq(fixRequests.id, id));
    return row ?? null;
  }

  async updateStatus(
    id: string,
    status: string,
    extras?: Partial<{
      classifiedErrorType: string;
      isInScope: boolean;
      scopeReason: string;
      jobId: string;
    }>,
  ) {
    const setValues: Record<string, unknown> = { status };
    if (extras) {
      if (extras.classifiedErrorType !== undefined) {
        setValues['classifiedErrorType'] = extras.classifiedErrorType;
      }
      if (extras.isInScope !== undefined) {
        setValues['isInScope'] = extras.isInScope;
      }
      if (extras.scopeReason !== undefined) {
        setValues['scopeReason'] = extras.scopeReason;
      }
      if (extras.jobId !== undefined) {
        setValues['jobId'] = extras.jobId;
      }
    }

    const [row] = await this.dbService.db
      .update(fixRequests)
      .set(setValues as Partial<typeof fixRequests.$inferInsert>)
      .where(eq(fixRequests.id, id))
      .returning();
    return row ?? null;
  }

  async findByErrorHash(errorHash: string) {
    return this.dbService.db
      .select()
      .from(fixRequests)
      .where(eq(fixRequests.errorHash, errorHash))
      .orderBy(desc(fixRequests.createdAt));
  }

  async findRecentByBranchAndCommit(branch: string, commitSha: string) {
    return this.dbService.db
      .select()
      .from(fixRequests)
      .where(
        and(
          eq(fixRequests.branch, branch),
          eq(fixRequests.commitSha, commitSha),
        ),
      )
      .orderBy(desc(fixRequests.createdAt));
  }

  async findRecent(limit: number) {
    return this.dbService.db
      .select()
      .from(fixRequests)
      .orderBy(desc(fixRequests.createdAt))
      .limit(limit);
  }

  async countByStatus(status: string): Promise<number> {
    const [row] = await this.dbService.db
      .select({ count: sql<number>`count(*)::int` })
      .from(fixRequests)
      .where(eq(fixRequests.status, status));
    return row?.count ?? 0;
  }
}
