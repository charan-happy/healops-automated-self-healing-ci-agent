import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import {
  plans,
  subscriptions,
  usageRecords,
  invoices,
} from '../../schema/billing';
import { eq, and, sql, desc } from 'drizzle-orm';

@Injectable()
export class BillingRepository {
  constructor(private readonly dbService: DBService) {}

  // ─── Plans ──────────────────────────────────────────────────────────────

  async findPlanBySlug(slug: string) {
    const [row] = await this.dbService.db
      .select()
      .from(plans)
      .where(eq(plans.slug, slug));
    return row ?? null;
  }

  async findActivePlans() {
    return this.dbService.db
      .select()
      .from(plans)
      .where(eq(plans.isActive, true));
  }

  // ─── Subscriptions ──────────────────────────────────────────────────────

  async createSubscription(data: typeof subscriptions.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(subscriptions)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create subscription');
    return row;
  }

  async findActiveSubscription(organizationId: string) {
    const [row] = await this.dbService.db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.organizationId, organizationId),
          sql`${subscriptions.status} IN ('active', 'trialing', 'past_due')`,
        ),
      );
    return row ?? null;
  }

  async findSubscriptionByStripeId(stripeSubscriptionId: string) {
    const [row] = await this.dbService.db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId));
    return row ?? null;
  }

  async updateSubscription(
    id: string,
    data: Partial<typeof subscriptions.$inferInsert>,
  ) {
    const [row] = await this.dbService.db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return row ?? null;
  }

  // ─── Usage Records ──────────────────────────────────────────────────────

  async upsertUsageRecord(data: {
    organizationId: string;
    subscriptionId: string;
    periodMonth: string;
    jobsDelta: number;
    tokensDelta: number;
  }) {
    const [row] = await this.dbService.db
      .insert(usageRecords)
      .values({
        organizationId: data.organizationId,
        subscriptionId: data.subscriptionId,
        periodMonth: data.periodMonth,
        jobsUsed: data.jobsDelta,
        tokensUsed: data.tokensDelta,
      })
      .onConflictDoUpdate({
        target: [
          usageRecords.organizationId,
          usageRecords.subscriptionId,
          usageRecords.periodMonth,
        ],
        set: {
          jobsUsed: sql`${usageRecords.jobsUsed} + ${data.jobsDelta}`,
          tokensUsed: sql`${usageRecords.tokensUsed} + ${data.tokensDelta}`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row ?? null;
  }

  async findCurrentUsage(organizationId: string, periodMonth: string) {
    const [row] = await this.dbService.db
      .select()
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.organizationId, organizationId),
          eq(usageRecords.periodMonth, periodMonth),
        ),
      );
    return row ?? null;
  }

  // ─── Invoices ───────────────────────────────────────────────────────────

  async createInvoice(data: typeof invoices.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(invoices)
      .values(data)
      .returning();
    return row ?? null;
  }

  async findInvoicesByOrganization(organizationId: string, limit = 20) {
    return this.dbService.db
      .select()
      .from(invoices)
      .where(eq(invoices.organizationId, organizationId))
      .orderBy(desc(invoices.createdAt))
      .limit(limit);
  }

  async updateInvoiceStatus(
    stripeInvoiceId: string,
    status: string,
    paidAt?: Date,
  ) {
    const [row] = await this.dbService.db
      .update(invoices)
      .set({ status, paidAt: paidAt ?? null })
      .where(eq(invoices.stripeInvoiceId, stripeInvoiceId))
      .returning();
    return row ?? null;
  }
}
