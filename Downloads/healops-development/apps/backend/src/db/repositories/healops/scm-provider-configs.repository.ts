import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { scmProviderConfigs } from '../../schema/scm';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class ScmProviderConfigsRepository {
  constructor(private readonly dbService: DBService) {}

  async createConfig(data: typeof scmProviderConfigs.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(scmProviderConfigs)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create SCM provider config');
    return row;
  }

  async findConfigById(id: string) {
    const [row] = await this.dbService.db
      .select()
      .from(scmProviderConfigs)
      .where(eq(scmProviderConfigs.id, id));
    return row ?? null;
  }

  async findConfigsByOrganization(organizationId: string) {
    return this.dbService.db
      .select()
      .from(scmProviderConfigs)
      .where(eq(scmProviderConfigs.organizationId, organizationId));
  }

  async findActiveConfigByOrgAndType(
    organizationId: string,
    providerType: string,
  ) {
    const [row] = await this.dbService.db
      .select()
      .from(scmProviderConfigs)
      .where(
        and(
          eq(scmProviderConfigs.organizationId, organizationId),
          eq(scmProviderConfigs.providerType, providerType),
          eq(scmProviderConfigs.isActive, true),
        ),
      );
    return row ?? null;
  }

  async updateConfig(
    id: string,
    data: Partial<typeof scmProviderConfigs.$inferInsert>,
  ) {
    const [row] = await this.dbService.db
      .update(scmProviderConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(scmProviderConfigs.id, id))
      .returning();
    return row ?? null;
  }

  async deactivateConfig(id: string) {
    return this.updateConfig(id, { isActive: false });
  }
}
