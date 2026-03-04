import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { notificationSettings } from '../../schema/membership';
import { eq, and, sql } from 'drizzle-orm';

@Injectable()
export class NotificationSettingsRepository {
  constructor(private readonly dbService: DBService) {}

  async upsertSetting(data: typeof notificationSettings.$inferInsert) {
    // The unique index uses COALESCE(user_id, sentinel) which Drizzle can't express
    // in onConflictDoUpdate target, so use find-then-insert/update pattern.
    const orgId = data.organizationId;
    const channel = data.channel;

    const existing = await this.dbService.db
      .select()
      .from(notificationSettings)
      .where(
        and(
          eq(notificationSettings.organizationId, orgId),
          eq(notificationSettings.channel, channel),
        ),
      )
      .limit(1);

    if (existing[0]) {
      const [row] = await this.dbService.db
        .update(notificationSettings)
        .set({
          events: data.events,
          config: data.config,
          isActive: data.isActive,
          updatedAt: new Date(),
        })
        .where(eq(notificationSettings.id, existing[0].id))
        .returning();
      return row ?? null;
    }

    const [row] = await this.dbService.db
      .insert(notificationSettings)
      .values(data)
      .returning();
    return row ?? null;
  }

  async findSettingsByOrganization(organizationId: string) {
    return this.dbService.db
      .select()
      .from(notificationSettings)
      .where(eq(notificationSettings.organizationId, organizationId));
  }

  async findActiveSettingsForEvent(
    organizationId: string,
    eventType: string,
  ) {
    return this.dbService.db
      .select()
      .from(notificationSettings)
      .where(
        and(
          eq(notificationSettings.organizationId, organizationId),
          eq(notificationSettings.isActive, true),
          sql`${notificationSettings.events} @> ${JSON.stringify([eventType])}::jsonb`,
        ),
      );
  }

  async deactivateSetting(id: string) {
    const [row] = await this.dbService.db
      .update(notificationSettings)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(notificationSettings.id, id))
      .returning();
    return row ?? null;
  }

  async deleteSetting(id: string) {
    await this.dbService.db
      .delete(notificationSettings)
      .where(eq(notificationSettings.id, id));
  }
}
