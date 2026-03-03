// ─── CI Provider Settings Service ───────────────────────────────────────────
// CRUD operations for CI provider configurations.
// Reuses validation logic from OnboardingService.configureCiProvider().

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CiProviderConfigsRepository } from '@db/repositories/healops/ci-provider-configs.repository';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { CiProviderFactory } from '../ci-provider/ci-provider.factory';
import type { HealOpsConfig } from '@config/healops.config';

interface AddProviderInput {
  provider: string;
  githubInstallationId?: string;
  accessToken?: string;
  serverUrl?: string;
  displayName?: string;
  scmProvider?: string;
}

interface UpdateProviderInput {
  isActive?: boolean;
  accessToken?: string;
  serverUrl?: string;
  displayName?: string;
  scmProvider?: string;
}

@Injectable()
export class CiProviderSettingsService {
  private readonly logger = new Logger(CiProviderSettingsService.name);

  constructor(
    private readonly ciProviderConfigsRepository: CiProviderConfigsRepository,
    private readonly platformRepository: PlatformRepository,
    private readonly ciProviderFactory: CiProviderFactory,
    private readonly configService: ConfigService,
  ) {}

  async listProviders(orgId: string) {
    const configs = await this.ciProviderConfigsRepository.findConfigsByOrganization(orgId);
    return configs.map((c) => ({
      id: c.id,
      providerType: c.providerType,
      displayName: c.displayName,
      isActive: c.isActive,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  async addProvider(orgId: string, data: AddProviderInput) {
    const org = await this.platformRepository.findOrganizationById(orgId);
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    // Build the config object based on provider type (same logic as OnboardingService)
    const config: Record<string, unknown> = {};
    let displayName = data.displayName ?? data.provider;
    let installUrl: string | undefined;

    switch (data.provider) {
      case 'github': {
        if (data.githubInstallationId) {
          config['installationId'] = data.githubInstallationId;
        }
        const healops = this.configService.get<HealOpsConfig>('healops');
        const appId = healops?.github.appId ?? '';
        if (appId) {
          installUrl = `https://github.com/apps/healops/installations/new?target_id=${orgId}`;
        }
        displayName = data.displayName ?? 'GitHub';
        break;
      }
      case 'gitlab': {
        if (!data.accessToken) {
          throw new BadRequestException('Access token is required for GitLab');
        }
        config['accessToken'] = data.accessToken;
        if (data.serverUrl) {
          config['serverUrl'] = data.serverUrl;
        }
        displayName = data.displayName ?? 'GitLab';
        break;
      }
      case 'jenkins': {
        if (!data.accessToken) {
          throw new BadRequestException('Access token is required for Jenkins');
        }
        config['accessToken'] = data.accessToken;
        if (!data.serverUrl) {
          throw new BadRequestException('Server URL is required for Jenkins');
        }
        config['serverUrl'] = data.serverUrl;
        if (data.scmProvider) {
          config['scmProvider'] = data.scmProvider;
        }
        displayName = data.displayName ?? 'Jenkins';
        break;
      }
      case 'bitbucket': {
        if (!data.accessToken) {
          throw new BadRequestException('Access token is required for Bitbucket');
        }
        config['accessToken'] = data.accessToken;
        if (data.serverUrl) {
          config['serverUrl'] = data.serverUrl;
        }
        displayName = data.displayName ?? 'Bitbucket';
        break;
      }
      default:
        throw new BadRequestException(`Unsupported provider: ${data.provider}`);
    }

    const providerConfig = await this.ciProviderConfigsRepository.createConfig({
      organizationId: orgId,
      providerType: data.provider,
      config,
      displayName,
    });

    this.logger.log(`CI provider ${data.provider} added for org ${orgId}`);

    const result: { providerConfigId: string; provider: string; installUrl?: string } = {
      providerConfigId: providerConfig.id,
      provider: data.provider,
    };

    if (installUrl) {
      result.installUrl = installUrl;
    }

    return result;
  }

  async updateProvider(configId: string, orgId: string, data: UpdateProviderInput) {
    const existing = await this.ciProviderConfigsRepository.findConfigById(configId);
    if (!existing || existing.organizationId !== orgId) {
      throw new NotFoundException('CI provider config not found');
    }

    const updateData: Record<string, unknown> = {};

    if (data.isActive !== undefined) {
      updateData['isActive'] = data.isActive;
    }
    if (data.displayName !== undefined) {
      updateData['displayName'] = data.displayName;
    }

    // Merge config fields if access token, server URL, or scmProvider changed
    if (data.accessToken !== undefined || data.serverUrl !== undefined || data.scmProvider !== undefined) {
      const existingConfig = (existing.config as Record<string, unknown>) ?? {};
      if (data.accessToken !== undefined) {
        existingConfig['accessToken'] = data.accessToken;
      }
      if (data.serverUrl !== undefined) {
        existingConfig['serverUrl'] = data.serverUrl;
      }
      if (data.scmProvider !== undefined) {
        existingConfig['scmProvider'] = data.scmProvider;
      }
      updateData['config'] = existingConfig;
    }

    const updated = await this.ciProviderConfigsRepository.updateConfig(configId, updateData);

    return {
      id: updated?.id,
      providerType: updated?.providerType,
      displayName: updated?.displayName,
      isActive: updated?.isActive,
      createdAt: updated?.createdAt?.toISOString(),
    };
  }

  async removeProvider(configId: string, orgId: string) {
    const existing = await this.ciProviderConfigsRepository.findConfigById(configId);
    if (!existing || existing.organizationId !== orgId) {
      throw new NotFoundException('CI provider config not found');
    }

    // Check if repos depend on this config
    const repos = await this.platformRepository.findRepositoriesByOrganization(orgId);
    const linkedRepos = repos.filter((r) => r.ciProviderConfigId === configId);

    if (linkedRepos.length > 0) {
      this.logger.warn(
        `Deactivating provider ${configId} with ${String(linkedRepos.length)} linked repos`,
      );
    }

    // Soft delete (deactivate)
    await this.ciProviderConfigsRepository.deactivateConfig(configId);

    return {
      deactivated: true,
      linkedRepoCount: linkedRepos.length,
    };
  }

  async listAvailableRepos(configId: string, orgId: string) {
    const config = await this.ciProviderConfigsRepository.findConfigById(configId);
    if (!config || config.organizationId !== orgId) {
      throw new NotFoundException('CI provider config not found');
    }

    const configData = (config.config as Record<string, string>) ?? {};

    try {
      const provider = this.ciProviderFactory.getProvider(config.providerType);
      const connectionConfig = this.ciProviderFactory.buildConnectionConfig({
        name: '',
        provider: config.providerType,
        authToken: configData['accessToken'] ?? configData['installationId'] ?? '',
        githubInstallationId: configData['installationId'],
      });

      // Use fetchFileTree as a proxy — for a real implementation this would
      // call a dedicated listRepos method on the provider. For now, return
      // an empty list with the provider info so the frontend can fall back.
      this.logger.log(`Listing repos for provider ${provider.providerName} config ${configId}`);

      return {
        provider: config.providerType,
        providerConfigId: config.id,
        repos: [] as Array<{
          externalRepoId: string;
          name: string;
          defaultBranch: string;
          language: string | null;
        }>,
        connectionConfig: {
          serverUrl: connectionConfig.serverUrl,
        },
      };
    } catch (err) {
      this.logger.warn(`Failed to list repos for config ${configId}: ${(err as Error).message}`);
      return {
        provider: config.providerType,
        providerConfigId: config.id,
        repos: [],
      };
    }
  }
}
