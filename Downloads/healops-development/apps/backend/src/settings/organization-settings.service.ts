// ─── Organization Settings Service ──────────────────────────────────────────
// Business logic for organization CRUD and member management.

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { MembershipRepository } from '@db/repositories/healops/membership.repository';
import { randomUUID } from 'crypto';

interface UpdateOrgInput {
  name?: string;
  slackWebhookUrl?: string;
}

@Injectable()
export class OrganizationSettingsService {
  private readonly logger = new Logger(OrganizationSettingsService.name);

  constructor(
    private readonly platformRepository: PlatformRepository,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  async getOrganization(orgId: string) {
    const org = await this.platformRepository.findOrganizationById(orgId);
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      slackWebhookUrl: org.slackWebhookUrl ?? null,
      monthlyJobLimit: org.monthlyJobLimit,
      monthlyTokenBudget: org.monthlyTokenBudget,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async updateOrganization(orgId: string, data: UpdateOrgInput) {
    const org = await this.platformRepository.findOrganizationById(orgId);
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) {
      updateData['name'] = data.name;
    }
    if (data.slackWebhookUrl !== undefined) {
      updateData['slackWebhookUrl'] = data.slackWebhookUrl;
    }

    const updated = await this.platformRepository.updateOrganization(orgId, updateData);

    this.logger.log(`Organization ${orgId} updated`);

    return {
      id: updated?.id,
      name: updated?.name,
      slug: updated?.slug,
      slackWebhookUrl: updated?.slackWebhookUrl ?? null,
      updated: true,
    };
  }

  async listMembers(orgId: string) {
    const members = await this.membershipRepository.findMembersByOrganization(orgId);

    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async listInvitations(orgId: string) {
    const invitations = await this.membershipRepository.findPendingInvitations(orgId);
    return invitations.map((inv) => ({
      id: inv.id,
      email: inv.email,
      role: inv.role,
      status: inv.status,
      expiresAt: inv.expiresAt?.toISOString() ?? null,
      createdAt: inv.createdAt?.toISOString() ?? null,
    }));
  }

  async revokeInvitation(invitationId: string) {
    await this.membershipRepository.revokeInvitation(invitationId);
    this.logger.log(`Invitation ${invitationId} revoked`);
    return { revoked: true };
  }

  async inviteMember(orgId: string, invitedBy: string, email: string, role?: string) {
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await this.membershipRepository.createInvitation({
      organizationId: orgId,
      email,
      role: role ?? 'member',
      token,
      invitedBy,
      expiresAt,
    });

    this.logger.log(`Invitation sent to ${email} for org ${orgId}`);

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      invited: true,
    };
  }

  async removeMember(orgId: string, userId: string) {
    const member = await this.membershipRepository.findMemberRole(orgId, userId);
    if (!member) {
      throw new NotFoundException('Member not found in this organization');
    }

    await this.membershipRepository.removeMember(orgId, userId);

    this.logger.log(`Member ${userId} removed from org ${orgId}`);

    return { removed: true };
  }
}
