// ─── Organization Settings Service ──────────────────────────────────────────
// CRUD for organization details, team members, and invitations.

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { MembershipRepository } from '@db/repositories/healops/membership.repository';
import { UsersRepository } from '@db/repositories/users/users.repository';
import { randomBytes } from 'crypto';

@Injectable()
export class OrganizationSettingsService {
  private readonly logger = new Logger(OrganizationSettingsService.name);

  constructor(
    private readonly platformRepository: PlatformRepository,
    private readonly membershipRepository: MembershipRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  async getOrganization(orgId: string) {
    const org = await this.platformRepository.findOrganizationById(orgId);
    if (!org) throw new NotFoundException('Organization not found');

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async updateOrganization(
    orgId: string,
    data: { name?: string; slackWebhookUrl?: string },
  ) {
    const org = await this.platformRepository.findOrganizationById(orgId);
    if (!org) throw new NotFoundException('Organization not found');

    const updateData: { name?: string; slug?: string; slackWebhookUrl?: string } = {};
    if (data.name) {
      updateData.name = data.name;
      updateData.slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }
    if (data.slackWebhookUrl !== undefined) {
      updateData.slackWebhookUrl = data.slackWebhookUrl;
    }

    const updated = await this.platformRepository.updateOrganization(orgId, updateData);
    if (!updated) throw new NotFoundException('Organization not found');

    this.logger.log(`Organization ${orgId} updated`);

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      plan: updated.plan,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async listMembers(orgId: string) {
    const members = await this.membershipRepository.findMembersByOrganization(orgId);

    // Enrich with user info
    const enriched = await Promise.all(
      members.map(async (m) => {
        const user = await this.usersRepository.findById(m.userId);
        return {
          id: m.id,
          userId: m.userId,
          email: user?.email ?? 'unknown',
          name: user
            ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email
            : 'Unknown',
          role: m.role,
          joinedAt: m.joinedAt.toISOString(),
        };
      }),
    );

    return enriched;
  }

  async inviteMember(orgId: string, invitedBy: string, email: string, role = 'member') {
    if (!email || !email.includes('@')) {
      throw new BadRequestException('Valid email is required');
    }

    // Check for existing pending invitation
    const pending = await this.membershipRepository.findPendingInvitations(orgId);
    const existing = pending.find(
      (inv) => inv.email.toLowerCase() === email.toLowerCase(),
    );
    if (existing) {
      throw new BadRequestException('An invitation has already been sent to this email');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7-day expiry

    const invitation = await this.membershipRepository.createInvitation({
      organizationId: orgId,
      email: email.toLowerCase(),
      role,
      token,
      invitedBy,
      expiresAt,
    });

    this.logger.log(`Invitation sent to ${email} for org ${orgId}`);

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async removeMember(orgId: string, targetUserId: string, requestingUserId: string) {
    // Prevent self-removal
    if (targetUserId === requestingUserId) {
      throw new BadRequestException('You cannot remove yourself');
    }

    // Check the target is not the owner
    const targetMember = await this.membershipRepository.findMemberRole(orgId, targetUserId);
    if (!targetMember) {
      throw new NotFoundException('Member not found');
    }
    if (targetMember.role === 'owner') {
      throw new ForbiddenException('Cannot remove the organization owner');
    }

    await this.membershipRepository.removeMember(orgId, targetUserId);
    this.logger.log(`Member ${targetUserId} removed from org ${orgId}`);

    return { removed: true };
  }

  async listInvitations(orgId: string) {
    const invitations = await this.membershipRepository.findPendingInvitations(orgId);
    return invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString(),
    }));
  }

  async revokeInvitation(orgId: string, invitationId: string) {
    const pending = await this.membershipRepository.findPendingInvitations(orgId);
    const invitation = pending.find((inv) => inv.id === invitationId);
    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }

    await this.membershipRepository.revokeInvitation(invitationId);
    this.logger.log(`Invitation ${invitationId} revoked for org ${orgId}`);

    return { revoked: true };
  }
}
