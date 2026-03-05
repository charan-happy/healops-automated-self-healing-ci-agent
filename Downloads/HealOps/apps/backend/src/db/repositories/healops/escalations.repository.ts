// ─── Escalations Repository ─────────────────────────────────────────────────
// Data access for: escalations

import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { escalations } from '../../schema/outputs';
import { eq, and, sql, isNull } from 'drizzle-orm';

@Injectable()
export class EscalationsRepository {
  constructor(private readonly dbService: DBService) {}

  async createEscalation(data: typeof escalations.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(escalations)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create escalation');
    return row;
  }

  async findEscalationByJob(jobId: string) {
    const [row] = await this.dbService.db
      .select()
      .from(escalations)
      .where(eq(escalations.jobId, jobId));
    return row ?? null;
  }

  async findOpenEscalations() {
    return this.dbService.db
      .select()
      .from(escalations)
      .where(isNull(escalations.resolvedAt));
  }

  async resolveEscalation(id: string) {
    const [row] = await this.dbService.db
      .update(escalations)
      .set({ resolvedAt: sql`now()` })
      .where(eq(escalations.id, id))
      .returning();
    return row ?? null;
  }

  async updateEscalation(id: string, data: { externalIssueId?: string; issueUrl?: string }) {
    const [row] = await this.dbService.db
      .update(escalations)
      .set(data)
      .where(eq(escalations.id, id))
      .returning();
    return row ?? null;
  }

  async findEscalationsByJobAndType(jobId: string, escalationType: string) {
    const [row] = await this.dbService.db
      .select()
      .from(escalations)
      .where(
        and(
          eq(escalations.jobId, jobId),
          eq(escalations.escalationType, escalationType),
        ),
      );
    return row ?? null;
  }
}
