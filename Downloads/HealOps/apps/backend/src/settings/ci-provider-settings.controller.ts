// ─── CI Provider Settings Controller ────────────────────────────────────────
// CRUD API for managing CI provider configurations after onboarding.

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
import { CiProviderSettingsService } from './ci-provider-settings.service';

@Controller({ path: `${RouteNames.HEALOPS_SETTINGS}/ci-providers`, version: '1' })
@ApiTags('Settings — CI Providers')
export class CiProviderSettingsController {
  constructor(
    private readonly service: CiProviderSettingsService,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all CI provider configs for the user\'s org' })
  @ApiResponse({ status: 200, description: 'Returns array of CI provider configs' })
  async listProviders(@CurrentUser() user: AuthUser) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.listProviders(orgId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a new CI provider config' })
  @ApiResponse({ status: 201, description: 'Provider config created' })
  async addProvider(
    @CurrentUser() user: AuthUser,
    @Body() body: { provider: string; githubInstallationId?: string; accessToken?: string; serverUrl?: string; displayName?: string; scmProvider?: string },
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.addProvider(orgId, body);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a CI provider config' })
  @ApiResponse({ status: 200, description: 'Provider config updated' })
  async updateProvider(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: { isActive?: boolean; accessToken?: string; serverUrl?: string; displayName?: string; scmProvider?: string },
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.updateProvider(id, orgId, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate (soft-delete) a CI provider config' })
  @ApiResponse({ status: 200, description: 'Provider config deactivated' })
  async deleteProvider(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.removeProvider(id, orgId);
  }

  @Get(':id/repos')
  @ApiOperation({ summary: 'List available repos from this CI provider' })
  @ApiResponse({ status: 200, description: 'Returns available repositories' })
  async listRepos(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.listAvailableRepos(id, orgId);
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
