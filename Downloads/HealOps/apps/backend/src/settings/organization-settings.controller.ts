// ─── Organization Settings Controller ───────────────────────────────────────
// REST API for managing organization details, team members, and invitations.

import {
  Controller,
  Get,
  Patch,
  Post,
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
import { OrganizationSettingsService } from './organization-settings.service';

@Controller({ path: `${RouteNames.HEALOPS_SETTINGS}/organization`, version: '1' })
@ApiTags('Settings — Organization')
export class OrganizationSettingsController {
  constructor(
    private readonly service: OrganizationSettingsService,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get current organization details' })
  @ApiResponse({ status: 200, description: 'Organization details' })
  async getOrganization(@CurrentUser() user: AuthUser) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.getOrganization(orgId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update organization details' })
  @ApiResponse({ status: 200, description: 'Organization updated' })
  async updateOrganization(
    @CurrentUser() user: AuthUser,
    @Body() body: { name?: string; slackWebhookUrl?: string },
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.updateOrganization(orgId, body);
  }

  @Get('members')
  @ApiOperation({ summary: 'List organization team members' })
  @ApiResponse({ status: 200, description: 'Array of members' })
  async listMembers(@CurrentUser() user: AuthUser) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.listMembers(orgId);
  }

  @Post('members/invite')
  @ApiOperation({ summary: 'Invite a new team member' })
  @ApiResponse({ status: 201, description: 'Invitation sent' })
  async inviteMember(
    @CurrentUser() user: AuthUser,
    @Body() body: { email: string; role?: string },
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.inviteMember(orgId, user.id, body.email, body.role);
  }

  @Delete('members/:userId')
  @ApiOperation({ summary: 'Remove a team member' })
  @ApiResponse({ status: 200, description: 'Member removed' })
  async removeMember(
    @CurrentUser() user: AuthUser,
    @Param('userId') targetUserId: string,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.removeMember(orgId, targetUserId, user.id);
  }

  @Get('invitations')
  @ApiOperation({ summary: 'List pending invitations' })
  @ApiResponse({ status: 200, description: 'Array of pending invitations' })
  async listInvitations(@CurrentUser() user: AuthUser) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.listInvitations(orgId);
  }

  @Delete('invitations/:id')
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  @ApiResponse({ status: 200, description: 'Invitation revoked' })
  async revokeInvitation(
    @CurrentUser() user: AuthUser,
    @Param('id') invitationId: string,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.revokeInvitation(orgId, invitationId);
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
