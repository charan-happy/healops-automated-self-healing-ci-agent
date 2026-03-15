// ─── Onboarding Controller ──────────────────────────────────────────────────
// Multi-step onboarding flow: create organization, configure CI provider,
// select repositories, and configure LLM.

import { Controller, Post, Get, Body, BadRequestException, Logger } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RouteNames } from '@common/route-names';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AuthUser } from '@auth/interfaces/auth-user.interface';
import { OnboardingService } from './onboarding.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { ConfigureCiProviderDto } from './dto/configure-ci-provider.dto';
import { SelectRepositoriesDto } from './dto/select-repositories.dto';
import { ConfigureLlmDto } from './dto/configure-llm.dto';
import { MembershipRepository } from '@db/repositories/healops/membership.repository';

@Controller({ path: RouteNames.HEALOPS_ONBOARDING, version: '1' })
@ApiTags('Onboarding')
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(
    private readonly onboardingService: OnboardingService,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  @Post('organization')
  @ApiOperation({ summary: 'Create a new organization (Step 1)' })
  @ApiResponse({
    status: 201,
    description: 'Organization created and user added as owner',
  })
  async createOrganization(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.onboardingService.createOrganization(user.id, dto);
  }

  @Post('ci-provider')
  @ApiOperation({ summary: 'Configure CI provider (Step 2)' })
  @ApiResponse({
    status: 201,
    description:
      'CI provider configured. For GitHub, returns the install URL.',
  })
  async configureCiProvider(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfigureCiProviderDto,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    const result = await this.onboardingService.configureCiProvider(orgId, dto);
    await this.onboardingService.advanceStep(
      orgId,
      user.id,
      'configure_ci_provider',
    );
    return result;
  }

  @Post('repositories')
  @ApiOperation({ summary: 'Select repositories to enable (Step 3)' })
  @ApiResponse({
    status: 201,
    description: 'Repositories selected and linked to the organization',
  })
  async selectRepositories(
    @CurrentUser() user: AuthUser,
    @Body() dto: SelectRepositoriesDto,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    const result = await this.onboardingService.selectRepositories(
      orgId,
      dto.repositories,
    );
    await this.onboardingService.advanceStep(
      orgId,
      user.id,
      'select_repositories',
    );
    return result;
  }

  @Post('llm-config')
  @ApiOperation({ summary: 'Configure LLM provider (Step 4)' })
  @ApiResponse({
    status: 201,
    description: 'LLM provider configured and onboarding completed',
  })
  async configureLlm(
    @CurrentUser() user: AuthUser,
    @Body() dto: ConfigureLlmDto,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.onboardingService.configureLlm(orgId, user.id, dto);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get current onboarding status' })
  @ApiResponse({
    status: 200,
    description:
      'Returns current step, completed steps, and completion status',
  })
  async getOnboardingStatus(@CurrentUser() user: AuthUser) {
    try {
      const orgId = await this.resolveOrganizationId(user.id);
      return this.onboardingService.getOnboardingStatus(orgId, user.id);
    } catch (err) {
      // New user with no organization yet — return default onboarding state
      if (!(err instanceof BadRequestException)) {
        this.logger.warn(`Unexpected error in getOnboardingStatus: ${err instanceof Error ? err.message : String(err)}`);
      }
      return {
        currentStep: 'create_organization',
        completedSteps: [],
        isComplete: false,
        completedAt: null,
        data: {},
      };
    }
  }

  /**
   * Resolve the organization ID for the authenticated user.
   * Uses the first organization the user belongs to.
   */
  private async resolveOrganizationId(userId: string): Promise<string> {
    const memberships =
      await this.membershipRepository.findOrganizationsByUser(userId);
    const membership = memberships[0];
    if (!membership) {
      throw new BadRequestException(
        'No organization found. Please create an organization first.',
      );
    }
    return membership.organizationId;
  }
}
