import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { notificationSettings } from '../../schema/membership';
import { eq, and, sql } from 'drizzle-orm';
import type { IndexColumn } from 'drizzle-orm/pg-core';

@Injectable()
export class NotificationSettingsRepository {
  constructor(private readonly dbService: DBService) {}

  async upsertSetting(data: typeof notificationSettings.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(notificationSettings)
      .values(data)
      .onConflictDoUpdate({
        target: sql`(organization_id, COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid), channel)` as unknown as IndexColumn,
        set: {
          events: data.events,
          config: data.config,
          isActive: data.isActive,
          updatedAt: new Date(),
        },
      })
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
