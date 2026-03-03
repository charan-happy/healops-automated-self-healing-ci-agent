// ─── Onboarding Service ─────────────────────────────────────────────────────
// Orchestrates the multi-step onboarding flow: create organization,
// configure CI provider, select repositories, and configure LLM.

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { OnboardingRepository } from '@db/repositories/healops/onboarding.repository';
import { MembershipRepository } from '@db/repositories/healops/membership.repository';
import { CiProviderConfigsRepository } from '@db/repositories/healops/ci-provider-configs.repository';
import type { HealOpsConfig } from '@config/healops.config';

const ONBOARDING_STEPS = [
  'create_organization',
  'configure_ci_provider',
  'select_repositories',
  'configure_llm',
] as const;

interface CreateOrganizationInput {
  name: string;
  slackWebhookUrl?: string;
}

interface ConfigureCiProviderInput {
  provider: string;
  githubInstallationId?: string;
  accessToken?: string;
  serverUrl?: string;
  scmProvider?: string;
}

interface RepositorySelection {
  externalRepoId: string;
  name: string;
  defaultBranch?: string;
}

interface ConfigureLlmInput {
  provider: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly platformRepository: PlatformRepository,
    private readonly onboardingRepository: OnboardingRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly ciProviderConfigsRepository: CiProviderConfigsRepository,
    private readonly configService: ConfigService,
  ) {}

  async createOrganization(userId: string, data: CreateOrganizationInput) {
    // Generate a URL-safe slug from the organization name
    const slug = data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Create the organization
    const orgInput: { name: string; slug: string; slackWebhookUrl?: string } = {
      name: data.name,
      slug,
    };
    if (data.slackWebhookUrl) {
      orgInput.slackWebhookUrl = data.slackWebhookUrl;
    }
    const org = await this.platformRepository.createOrganization(orgInput);

    // Add the creating user as owner
    await this.membershipRepository.addMember({
      organizationId: org.id,
      userId,
      role: 'owner',
    });

    // Initialize onboarding progress
    const progress = await this.onboardingRepository.findOrCreateProgress(
      org.id,
      userId,
    );

    // Mark first step as completed
    await this.onboardingRepository.updateStep(
      org.id,
      userId,
      'configure_ci_provider',
      ['create_organization'],
      { organizationId: org.id },
    );

    this.logger.log(`Organization ${org.id} created by user ${userId}`);

    return {
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
      },
      onboardingProgressId: progress.id,
    };
  }

  async configureCiProvider(organizationId: string, data: ConfigureCiProviderInput) {
    // Validate the organization exists
    const org = await this.platformRepository.findOrganizationById(organizationId);
    if (!org) {
      throw new BadRequestException('Organization not found');
    }

    // Build the config object based on provider type
    const config: Record<string, unknown> = {};
    let displayName = data.provider;
    let installUrl: string | undefined;

    switch (data.provider) {
      case 'github': {
        if (data.githubInstallationId) {
          config['installationId'] = data.githubInstallationId;
        }
        // Generate the GitHub App install URL
        const healops = this.configService.get<HealOpsConfig>('healops');
        const appId = healops?.github.appId ?? '';
        if (appId) {
          installUrl = `https://github.com/apps/healops/installations/new?target_id=${organizationId}`;
        }
        displayName = 'GitHub';
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
        displayName = 'GitLab';
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
        displayName = 'Jenkins';
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
        displayName = 'Bitbucket';
        break;
      }
    }

    // Create the CI provider config
    const providerConfig = await this.ciProviderConfigsRepository.createConfig({
      organizationId,
      providerType: data.provider,
      config,
      displayName,
    });

    this.logger.log(
      `CI provider ${data.provider} configured for org ${organizationId}`,
    );

    const result: { providerConfigId: string; provider: string; installUrl?: string } = {
      providerConfigId: providerConfig.id,
      provider: data.provider,
    };

    if (installUrl) {
      result.installUrl = installUrl;
    }

    return result;
  }

  async selectRepositories(organizationId: string, selections: RepositorySelection[]) {
    // Validate the organization exists
    const org = await this.platformRepository.findOrganizationById(organizationId);
    if (!org) {
      throw new BadRequestException('Organization not found');
    }

    // Find the active CI provider config for this org to determine provider type
    const ciConfigs = await this.ciProviderConfigsRepository.findConfigsByOrganization(
      organizationId,
    );
    const activeCiConfig = ciConfigs.find((c) => c.isActive);
    // Use scmProvider from config JSONB if set (for CI-only providers like Jenkins),
    // otherwise fall back to the CI provider type itself (GitHub/GitLab act as both SCM and CI)
    const configData = activeCiConfig?.config as Record<string, unknown> | undefined;
    const provider = (configData?.['scmProvider'] as string | undefined) ?? activeCiConfig?.providerType ?? 'github';

    // Create repository entries
    const createdRepos = await Promise.all(
      selections.map(async (repo) => {
        const existing = await this.platformRepository.findRepositoryByProviderAndExternalId(
          provider,
          repo.externalRepoId,
        );

        if (existing) {
          return existing;
        }

        const repoData: {
          organizationId: string;
          provider: string;
          externalRepoId: string;
          name: string;
          defaultBranch: string;
          ciProviderConfigId?: string;
        } = {
          organizationId,
          provider,
          externalRepoId: repo.externalRepoId,
          name: repo.name,
          defaultBranch: repo.defaultBranch ?? 'main',
        };
        if (activeCiConfig?.id) {
          repoData.ciProviderConfigId = activeCiConfig.id;
        }
        return this.platformRepository.createRepository(repoData);
      }),
    );

    this.logger.log(
      `${String(createdRepos.length)} repositories selected for org ${organizationId}`,
    );

    return {
      repositories: createdRepos.map((r) => ({
        id: r.id,
        name: r.name,
        provider: r.provider,
        externalRepoId: r.externalRepoId,
        defaultBranch: r.defaultBranch,
      })),
    };
  }

  async configureLlm(
    organizationId: string,
    userId: string,
    data: ConfigureLlmInput,
  ) {
    // Validate the organization exists
    const org = await this.platformRepository.findOrganizationById(organizationId);
    if (!org) {
      throw new BadRequestException('Organization not found');
    }

    // Store LLM config in onboarding_progress.data JSONB
    const progress = await this.onboardingRepository.findOrCreateProgress(
      organizationId,
      userId,
    );

    const existingData = (progress.data as Record<string, unknown>) ?? {};
    const llmConfig: Record<string, unknown> = {
      provider: data.provider,
    };

    if (data.apiKey) {
      llmConfig['apiKey'] = data.apiKey;
    }
    if (data.baseUrl) {
      llmConfig['baseUrl'] = data.baseUrl;
    }
    if (data.model) {
      llmConfig['model'] = data.model;
    }

    const updatedData = {
      ...existingData,
      llmConfig,
    };

    // Mark onboarding as complete
    await this.onboardingRepository.updateStep(
      organizationId,
      userId,
      'complete',
      [...ONBOARDING_STEPS],
      updatedData,
    );

    await this.onboardingRepository.completeOnboarding(organizationId, userId);

    this.logger.log(
      `LLM configured (${data.provider}) for org ${organizationId}, onboarding complete`,
    );

    return {
      provider: data.provider,
      configured: true,
      onboardingComplete: true,
    };
  }

  async getOnboardingStatus(organizationId: string, userId: string) {
    const progress = await this.onboardingRepository.findOrCreateProgress(
      organizationId,
      userId,
    );

    const completedSteps = (progress.completedSteps as string[]) ?? [];
    const isComplete = progress.completedAt !== null;

    return {
      currentStep: progress.currentStep,
      completedSteps,
      isComplete,
      completedAt: progress.completedAt,
      data: progress.data,
    };
  }

  /**
   * Advance onboarding to the next step after completing a step.
   * Called internally by controller after each step endpoint succeeds.
   */
  async advanceStep(organizationId: string, userId: string, completedStep: string) {
    const progress = await this.onboardingRepository.findOrCreateProgress(
      organizationId,
      userId,
    );

    const completedSteps = (progress.completedSteps as string[]) ?? [];
    if (!completedSteps.includes(completedStep)) {
      completedSteps.push(completedStep);
    }

    // Determine the next step
    const currentIndex = ONBOARDING_STEPS.indexOf(
      completedStep as (typeof ONBOARDING_STEPS)[number],
    );
    const nextStep =
      currentIndex >= 0 && currentIndex < ONBOARDING_STEPS.length - 1
        ? ONBOARDING_STEPS[currentIndex + 1]
        : 'complete';

    const existingData = (progress.data as Record<string, unknown>) ?? {};

    await this.onboardingRepository.updateStep(
      organizationId,
      userId,
      nextStep ?? 'complete',
      completedSteps,
      existingData,
    );
  }
}
