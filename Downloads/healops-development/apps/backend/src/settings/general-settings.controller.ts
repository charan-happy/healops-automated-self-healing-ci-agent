// ─── General Settings Controller ────────────────────────────────────────────
// Endpoints for AI config, notification preferences, and API keys.

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RouteNames } from '@common/route-names';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AuthUser } from '@auth/interfaces/auth-user.interface';
import { MembershipRepository } from '@db/repositories/healops/membership.repository';
import { OnboardingRepository } from '@db/repositories/healops/onboarding.repository';
import { NotificationSettingsRepository } from '@db/repositories/healops/notification-settings.repository';
import { ApiKeyService } from '@auth/services/api-key.service';

@Controller({ path: RouteNames.HEALOPS_SETTINGS, version: '1' })
@ApiTags('Settings — General')
export class GeneralSettingsController {
  constructor(
    private readonly membershipRepository: MembershipRepository,
    private readonly onboardingRepository: OnboardingRepository,
    private readonly notificationSettingsRepository: NotificationSettingsRepository,
    private readonly apiKeyService: ApiKeyService,
  ) {}

  // ─── AI Config ──────────────────────────────────────────────────────────

  @Get('ai-config')
  @ApiOperation({ summary: 'Get current AI/LLM config' })
  async getAiConfig(@CurrentUser() user: AuthUser) {
    const orgId = await this.resolveOrganizationId(user.id);
    const progress = await this.onboardingRepository.findOrCreateProgress(orgId, user.id);
    const data = (progress.data as Record<string, unknown>) ?? {};
    const llmConfig = (data['llmConfig'] as Record<string, unknown>) ?? {};

    return {
      provider: (llmConfig['provider'] as string) ?? 'claude',
      apiKey: llmConfig['apiKey'] ? '••••••••' : '',
      baseUrl: (llmConfig['baseUrl'] as string) ?? '',
      model: (llmConfig['model'] as string) ?? '',
    };
  }

  @Patch('ai-config')
  @ApiOperation({ summary: 'Update AI/LLM config' })
  async updateAiConfig(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      provider: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    },
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    const progress = await this.onboardingRepository.findOrCreateProgress(orgId, user.id);
    const existingData = (progress.data as Record<string, unknown>) ?? {};

    const llmConfig: Record<string, unknown> = { provider: body.provider };
    if (body.apiKey) llmConfig['apiKey'] = body.apiKey;
    if (body.baseUrl) llmConfig['baseUrl'] = body.baseUrl;
    if (body.model) llmConfig['model'] = body.model;

    await this.onboardingRepository.updateStep(
      orgId,
      user.id,
      progress.currentStep,
      (progress.completedSteps as string[]) ?? [],
      { ...existingData, llmConfig },
    );

    return {
      provider: body.provider,
      configured: true,
    };
  }

  // ─── Notification Settings ──────────────────────────────────────────────

  @Get('notifications')
  @ApiOperation({ summary: 'Get notification preferences' })
  async getNotifications(@CurrentUser() user: AuthUser) {
    const orgId = await this.resolveOrganizationId(user.id);
    const settings =
      await this.notificationSettingsRepository.findSettingsByOrganization(orgId);

    return settings.map((s) => ({
      id: s.id,
      channel: s.channel,
      events: s.events,
      config: s.config,
      isActive: s.isActive,
    }));
  }

  @Patch('notifications')
  @ApiOperation({ summary: 'Save notification preferences' })
  async updateNotifications(
    @CurrentUser() user: AuthUser,
    @Body()
    body: {
      channels: Array<{
        channel: string;
        enabled: boolean;
        config: Record<string, string>;
      }>;
      events: string[];
    },
  ) {
    const orgId = await this.resolveOrganizationId(user.id);

    const results = await Promise.all(
      body.channels.map(async (ch) => {
        return this.notificationSettingsRepository.upsertSetting({
          organizationId: orgId,
          channel: ch.channel,
          events: body.events,
          config: ch.config,
          isActive: ch.enabled,
        });
      }),
    );

    return results.filter(Boolean).map((s) => ({
      id: s?.id,
      channel: s?.channel,
      isActive: s?.isActive,
    }));
  }

  // ─── API Keys ───────────────────────────────────────────────────────────

  @Get('api-keys')
  @ApiOperation({ summary: 'List API keys' })
  async listApiKeys(@CurrentUser() user: AuthUser) {
    return this.apiKeyService.listApiKeys(user.id);
  }

  @Post('api-keys')
  @ApiOperation({ summary: 'Create a new API key' })
  async createApiKey(
    @CurrentUser() user: AuthUser,
    @Body() body: { name: string },
  ) {
    if (!body.name?.trim()) {
      throw new BadRequestException('Key name is required');
    }
    return this.apiKeyService.generateApiKey(user.id, body.name.trim(), ['healops:read', 'healops:write']);
  }

  @Delete('api-keys/:id')
  @ApiOperation({ summary: 'Revoke an API key' })
  async deleteApiKey(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    await this.apiKeyService.revokeApiKey(id, user.id);
    return { revoked: true };
  }

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
