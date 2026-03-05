import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { ciProviderConfigs } from '../../schema/membership';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class CiProviderConfigsRepository {
  constructor(private readonly dbService: DBService) {}

  async createConfig(data: typeof ciProviderConfigs.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(ciProviderConfigs)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create CI provider config');
    return row;
  }

  async findConfigById(id: string) {
    const [row] = await this.dbService.db
      .select()
      .from(ciProviderConfigs)
      .where(eq(ciProviderConfigs.id, id));
    return row ?? null;
  }

  async findConfigsByOrganization(organizationId: string) {
    return this.dbService.db
      .select()
      .from(ciProviderConfigs)
      .where(eq(ciProviderConfigs.organizationId, organizationId));
  }

  async findActiveConfigByOrgAndType(
    organizationId: string,
    providerType: string,
  ) {
    const [row] = await this.dbService.db
      .select()
      .from(ciProviderConfigs)
      .where(
        and(
          eq(ciProviderConfigs.organizationId, organizationId),
          eq(ciProviderConfigs.providerType, providerType),
          eq(ciProviderConfigs.isActive, true),
        ),
      );
    return row ?? null;
  }

  async updateConfig(
    id: string,
    data: Partial<typeof ciProviderConfigs.$inferInsert>,
  ) {
    const [row] = await this.dbService.db
      .update(ciProviderConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ciProviderConfigs.id, id))
      .returning();
    return row ?? null;
  }

  async deactivateConfig(id: string) {
    return this.updateConfig(id, { isActive: false });
  }
}
