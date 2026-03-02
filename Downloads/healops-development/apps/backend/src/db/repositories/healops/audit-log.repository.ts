// ─── HealOps Audit Log Repository ───────────────────────────────────────────
// Data access for: healops_audit_logs, slack_notifications

import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { healopsAuditLogs, slackNotifications } from '../../schema/operations';
import { eq, and, desc } from 'drizzle-orm';

@Injectable()
export class HealopsAuditLogRepository {
  constructor(private readonly dbService: DBService) {}

  // ─── Audit Logs ────────────────────────────────────────────────────────

  async createAuditLog(data: typeof healopsAuditLogs.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(healopsAuditLogs)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create audit log');
    return row;
  }

  async findAuditLogsByEntity(entityType: string, entityId: string) {
    return this.dbService.db
      .select()
      .from(healopsAuditLogs)
      .where(
        and(
          eq(healopsAuditLogs.entityType, entityType),
          eq(healopsAuditLogs.entityId, entityId),
        ),
      )
      .orderBy(desc(healopsAuditLogs.createdAt));
  }

  async findRecentAuditLogs(limit: number) {
    return this.dbService.db
      .select()
      .from(healopsAuditLogs)
      .orderBy(desc(healopsAuditLogs.createdAt))
      .limit(limit);
  }

  // ─── Slack Notifications ──────────────────────────────────────────────

  async createSlackNotification(data: typeof slackNotifications.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(slackNotifications)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create slack notification');
    return row;
  }

  async findSlackThreadTs(jobId: string): Promise<string | null> {
    const [row] = await this.dbService.db
      .select({ slackThreadTs: slackNotifications.slackThreadTs })
      .from(slackNotifications)
      .where(eq(slackNotifications.jobId, jobId))
      .orderBy(slackNotifications.sentAt)
      .limit(1);
    return row?.slackThreadTs ?? null;
  }

  async findSlackNotificationsByJob(jobId: string) {
    return this.dbService.db
      .select()
      .from(slackNotifications)
      .where(eq(slackNotifications.jobId, jobId))
      .orderBy(slackNotifications.sentAt);
  }
}
