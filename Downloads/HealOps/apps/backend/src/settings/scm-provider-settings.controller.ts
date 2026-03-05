// ─── SCM Provider Settings Controller ───────────────────────────────────────
// CRUD API for managing Source Code Management provider configurations.

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
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RouteNames } from '@common/route-names';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AuthUser } from '@auth/interfaces/auth-user.interface';
import { MembershipRepository } from '@db/repositories/healops/membership.repository';
import { ScmProviderSettingsService } from './scm-provider-settings.service';

@Controller({ path: `${RouteNames.HEALOPS_SETTINGS}/scm-providers`, version: '1' })
@ApiTags('Settings — SCM Providers')
export class ScmProviderSettingsController {
  constructor(
    private readonly service: ScmProviderSettingsService,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all SCM provider configs for the user\'s org' })
  @ApiResponse({ status: 200, description: 'Returns array of SCM provider configs' })
  async listProviders(@CurrentUser() user: AuthUser) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.listProviders(orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a new SCM provider config' })
  @ApiResponse({ status: 201, description: 'Provider config created' })
  async addProvider(
    @CurrentUser() user: AuthUser,
    @Body() body: {
      provider: string;
      githubInstallationId?: string;
      accessToken?: string;
      serverUrl?: string;
      workspace?: string;
      displayName?: string;
    },
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.addProvider(orgId, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an SCM provider config' })
  @ApiResponse({ status: 200, description: 'Provider config updated' })
  async updateProvider(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { isActive?: boolean; accessToken?: string; serverUrl?: string; displayName?: string },
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.updateProvider(id, orgId, body);
  }

  @Get(':id/repos')
  @ApiOperation({ summary: 'List available repos from this SCM provider' })
  @ApiResponse({ status: 200, description: 'Returns available repositories' })
  async listRepos(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.listAvailableRepos(id, orgId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate (soft-delete) an SCM provider config' })
  @ApiResponse({ status: 200, description: 'Provider config deactivated' })
  async deleteProvider(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.removeProvider(id, orgId);
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
