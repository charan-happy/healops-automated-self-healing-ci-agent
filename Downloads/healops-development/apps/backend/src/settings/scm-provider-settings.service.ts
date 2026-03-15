// ─── SCM Provider Settings Service ──────────────────────────────────────────
// CRUD operations for SCM provider configurations.
// Mirrors the CI provider settings pattern but for source code providers.

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ScmProviderConfigsRepository } from '@db/repositories/healops/scm-provider-configs.repository';
import { CiProviderFactory } from '../ci-provider/ci-provider.factory';

interface AddProviderInput {
  providerType: string;
  config?: Record<string, unknown>;
  displayName?: string;
}

interface UpdateProviderInput {
  isActive?: boolean;
  config?: Record<string, unknown>;
  displayName?: string;
}

@Injectable()
export class ScmProviderSettingsService {
  private readonly logger = new Logger(ScmProviderSettingsService.name);

  constructor(
    private readonly scmProviderConfigsRepository: ScmProviderConfigsRepository,
    private readonly ciProviderFactory: CiProviderFactory,
  ) {}

  async listProviders(orgId: string) {
    const configs = await this.scmProviderConfigsRepository.findConfigsByOrganization(orgId);
    return configs.map((c) => ({
      id: c.id,
      providerType: c.providerType,
      displayName: c.displayName,
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async addProvider(orgId: string, data: AddProviderInput) {
    if (!data.providerType?.trim()) {
      throw new BadRequestException('providerType is required');
    }

    const supportedTypes = ['github', 'gitlab', 'bitbucket'];
    if (!supportedTypes.includes(data.providerType)) {
      throw new BadRequestException(
        `Unsupported provider type: ${data.providerType}. Supported: ${supportedTypes.join(', ')}`,
      );
    }

    const displayName = data.displayName ?? data.providerType;

    const config = await this.scmProviderConfigsRepository.createConfig({
      organizationId: orgId,
      providerType: data.providerType,
      config: data.config ?? {},
      displayName,
    });

    this.logger.log(`SCM provider ${data.providerType} added for org ${orgId}`);

    return {
      id: config.id,
      providerType: config.providerType,
      displayName: config.displayName,
      isActive: config.isActive,
      createdAt: config.createdAt.toISOString(),
    };
  }

  async updateProvider(configId: string, orgId: string, data: UpdateProviderInput) {
    const existing = await this.scmProviderConfigsRepository.findConfigById(configId);
    if (!existing || existing.organizationId !== orgId) {
      throw new NotFoundException('SCM provider config not found');
    }

    const updateData: Partial<Record<string, unknown>> = {};

    if (data.isActive !== undefined) {
      updateData['isActive'] = data.isActive;
    }
    if (data.displayName !== undefined) {
      updateData['displayName'] = data.displayName;
    }
    if (data.config !== undefined) {
      const existingConfig = (existing.config as Record<string, unknown>) ?? {};
      updateData['config'] = { ...existingConfig, ...data.config };
    }

    const updated = await this.scmProviderConfigsRepository.updateConfig(configId, updateData);

    return {
      id: updated?.id,
      providerType: updated?.providerType,
      displayName: updated?.displayName,
      isActive: updated?.isActive,
      updatedAt: updated?.updatedAt?.toISOString(),
    };
  }

  async removeProvider(configId: string, orgId: string) {
    const existing = await this.scmProviderConfigsRepository.findConfigById(configId);
    if (!existing || existing.organizationId !== orgId) {
      throw new NotFoundException('SCM provider config not found');
    }

    await this.scmProviderConfigsRepository.deactivateConfig(configId);

    this.logger.log(`SCM provider ${configId} deactivated for org ${orgId}`);

    return { deactivated: true };
  }

  async listAvailableRepos(configId: string, orgId: string) {
    const config = await this.scmProviderConfigsRepository.findConfigById(configId);
    if (!config || config.organizationId !== orgId) {
      throw new NotFoundException('SCM provider config not found');
    }

    try {
      const provider = this.ciProviderFactory.getProvider(config.providerType);

      this.logger.log(
        `Listing repos for SCM provider ${provider.providerName} config ${configId}`,
      );

      // Return provider info — actual repo listing depends on provider implementation
      return {
        provider: config.providerType,
        providerConfigId: config.id,
        repos: [] as Array<{
          externalRepoId: string;
          name: string;
          defaultBranch: string;
          language: string | null;
        }>,
      };
    } catch (err) {
      this.logger.warn(
        `Failed to list repos for SCM config ${configId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        provider: config.providerType,
        providerConfigId: config.id,
        repos: [],
      };
    }
  }
}
