import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { dashboardSnapshots } from '../../schema/membership';
import { eq, and, sql, desc, lt } from 'drizzle-orm';
import type { IndexColumn } from 'drizzle-orm/pg-core';

@Injectable()
export class DashboardRepository {
  constructor(private readonly dbService: DBService) {}

  async upsertSnapshot(data: typeof dashboardSnapshots.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(dashboardSnapshots)
      .values(data)
      .onConflictDoUpdate({
        target: sql`(organization_id, COALESCE(repository_id, '00000000-0000-0000-0000-000000000000'::uuid), snapshot_type, snapshot_date)` as unknown as IndexColumn,
        set: {
          metrics: data.metrics,
          computedAt: new Date(),
        },
      })
      .returning();
    return row ?? null;
  }

  async findLatestSnapshot(
    organizationId: string,
    snapshotType: string,
    repositoryId?: string,
  ) {
    const conditions = [
      eq(dashboardSnapshots.organizationId, organizationId),
      eq(dashboardSnapshots.snapshotType, snapshotType),
    ];

    if (repositoryId) {
      conditions.push(eq(dashboardSnapshots.repositoryId, repositoryId));
    } else {
      conditions.push(sql`${dashboardSnapshots.repositoryId} IS NULL`);
    }

    const [row] = await this.dbService.db
      .select()
      .from(dashboardSnapshots)
      .where(and(...conditions))
      .orderBy(desc(dashboardSnapshots.snapshotDate))
      .limit(1);
    return row ?? null;
  }

  async findSnapshotsByDateRange(
    organizationId: string,
    snapshotType: string,
    fromDate: string,
    toDate: string,
  ) {
    return this.dbService.db
      .select()
      .from(dashboardSnapshots)
      .where(
        and(
          eq(dashboardSnapshots.organizationId, organizationId),
          eq(dashboardSnapshots.snapshotType, snapshotType),
          sql`${dashboardSnapshots.snapshotDate} >= ${fromDate}`,
          sql`${dashboardSnapshots.snapshotDate} <= ${toDate}`,
          sql`${dashboardSnapshots.repositoryId} IS NULL`,
        ),
      )
      .orderBy(dashboardSnapshots.snapshotDate);
  }

  async deleteOldSnapshots(beforeDate: string, snapshotType: string) {
    await this.dbService.db
      .delete(dashboardSnapshots)
      .where(
        and(
          eq(dashboardSnapshots.snapshotType, snapshotType),
          lt(dashboardSnapshots.snapshotDate, beforeDate),
        ),
      );
  }
}
