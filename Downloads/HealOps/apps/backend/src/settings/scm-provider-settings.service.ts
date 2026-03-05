// ─── SCM Provider Settings Service ──────────────────────────────────────────
// CRUD operations for Source Code Management provider configurations.

import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ScmProviderConfigsRepository } from '@db/repositories/healops/scm-provider-configs.repository';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { CiProviderFactory } from '../ci-provider/ci-provider.factory';
import type { HealOpsConfig } from '@config/healops.config';

const VALID_SCM_PROVIDERS = ['github', 'gitlab', 'bitbucket'] as const;

interface AddScmProviderInput {
  provider: string;
  githubInstallationId?: string;
  accessToken?: string;
  serverUrl?: string;
  workspace?: string;
  displayName?: string;
}

interface UpdateScmProviderInput {
  isActive?: boolean;
  accessToken?: string;
  serverUrl?: string;
  displayName?: string;
}

@Injectable()
export class ScmProviderSettingsService {
  private readonly logger = new Logger(ScmProviderSettingsService.name);

  constructor(
    private readonly scmProviderConfigsRepository: ScmProviderConfigsRepository,
    private readonly platformRepository: PlatformRepository,
    private readonly ciProviderFactory: CiProviderFactory,
    private readonly configService: ConfigService,
  ) {}

  async listProviders(orgId: string) {
    const configs = await this.scmProviderConfigsRepository.findConfigsByOrganization(orgId);
    return configs.map((c) => {
      const configData = (c.config as Record<string, unknown>) ?? {};
      return {
        id: c.id,
        providerType: c.providerType,
        displayName: c.displayName,
        isActive: c.isActive,
        hasToken: Boolean(configData['accessToken'] || configData['installationId']),
        createdAt: c.createdAt.toISOString(),
      };
    });
  }

  async addProvider(orgId: string, data: AddScmProviderInput) {
    const org = await this.platformRepository.findOrganizationById(orgId);
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    if (!VALID_SCM_PROVIDERS.includes(data.provider as typeof VALID_SCM_PROVIDERS[number])) {
      throw new BadRequestException(
        `Unsupported SCM provider: ${data.provider}. Must be one of: ${VALID_SCM_PROVIDERS.join(', ')}`,
      );
    }

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
          installUrl = `https://github.com/apps/healops-dev/installations/new`;
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
      case 'bitbucket': {
        if (!data.accessToken) {
          throw new BadRequestException('App password is required for Bitbucket');
        }
        config['accessToken'] = data.accessToken;
        if (data.workspace) {
          config['workspace'] = data.workspace;
        }
        if (data.serverUrl) {
          config['serverUrl'] = data.serverUrl;
        }
        displayName = data.displayName ?? 'Bitbucket';
        break;
      }
    }

    const providerConfig = await this.scmProviderConfigsRepository.createConfig({
      organizationId: orgId,
      providerType: data.provider,
      config,
      displayName,
    });

    this.logger.log(`SCM provider ${data.provider} added for org ${orgId}`);

    const result: { providerConfigId: string; provider: string; installUrl?: string } = {
      providerConfigId: providerConfig.id,
      provider: data.provider,
    };

    if (installUrl) {
      result.installUrl = installUrl;
    }

    return result;
  }

  async updateProvider(configId: string, orgId: string, data: UpdateScmProviderInput) {
    const existing = await this.scmProviderConfigsRepository.findConfigById(configId);
    if (!existing || existing.organizationId !== orgId) {
      throw new NotFoundException('SCM provider config not found');
    }

    const updateData: Record<string, unknown> = {};

    if (data.isActive !== undefined) {
      updateData['isActive'] = data.isActive;
    }
    if (data.displayName !== undefined) {
      updateData['displayName'] = data.displayName;
    }

    if (data.accessToken !== undefined || data.serverUrl !== undefined) {
      const existingConfig = (existing.config as Record<string, unknown>) ?? {};
      if (data.accessToken !== undefined) {
        existingConfig['accessToken'] = data.accessToken;
      }
      if (data.serverUrl !== undefined) {
        existingConfig['serverUrl'] = data.serverUrl;
      }
      updateData['config'] = existingConfig;
    }

    const updated = await this.scmProviderConfigsRepository.updateConfig(configId, updateData);

    return {
      id: updated?.id,
      providerType: updated?.providerType,
      displayName: updated?.displayName,
      isActive: updated?.isActive,
      createdAt: updated?.createdAt?.toISOString(),
    };
  }

  async listAvailableRepos(configId: string, orgId: string) {
    const config = await this.scmProviderConfigsRepository.findConfigById(configId);
    if (!config || config.organizationId !== orgId) {
      throw new NotFoundException('SCM provider config not found');
    }

    const configData = (config.config as Record<string, string>) ?? {};

    try {
      const provider = this.ciProviderFactory.getProvider(config.providerType);
      const authToken = configData['accessToken'] ?? configData['installationId'] ?? '';
      const serverUrl = configData['serverUrl'];

      this.logger.log(`Listing repos for SCM provider ${provider.providerName} config ${configId}`);

      const repos = await provider.listRepositories(authToken, serverUrl);

      return {
        provider: config.providerType,
        providerConfigId: config.id,
        repos: repos.map((r) => ({
          externalRepoId: r.externalRepoId,
          name: r.fullName,
          defaultBranch: r.defaultBranch,
          language: r.language,
          isPrivate: r.isPrivate,
          url: r.url,
        })),
      };
    } catch (err) {
      const message = (err as Error).message ?? 'Unknown error';
      this.logger.warn(`Failed to list repos for SCM config ${configId}: ${message}`);

      let error = 'Failed to fetch repositories.';
      if (message.includes('401')) {
        error = 'Authentication failed — your access token is invalid or expired.';
      } else if (message.includes('403')) {
        error = 'Access denied — your token lacks the required permissions (needs read_api scope).';
      } else if (message.includes('ENOTFOUND')) {
        error = `Server not found — check the server URL. ${message.match(/ENOTFOUND\s+(\S+)/)?.[1] ?? ''} is not reachable.`;
      } else if (message.includes('ECONNREFUSED') || message.includes('ETIMEDOUT')) {
        error = 'Connection failed — the server is unreachable. Check the server URL.';
      }

      return {
        provider: config.providerType,
        providerConfigId: config.id,
        repos: [],
        error,
      };
    }
  }

  async removeProvider(configId: string, orgId: string) {
    const existing = await this.scmProviderConfigsRepository.findConfigById(configId);
    if (!existing || existing.organizationId !== orgId) {
      throw new NotFoundException('SCM provider config not found');
    }

    await this.scmProviderConfigsRepository.deactivateConfig(configId);

    return { deactivated: true };
  }
}
