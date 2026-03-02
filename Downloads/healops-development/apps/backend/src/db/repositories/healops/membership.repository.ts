import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import {
  organizationMembers,
  organizationInvitations,
} from '../../schema/membership';
import { eq, and } from 'drizzle-orm';

@Injectable()
export class MembershipRepository {
  constructor(private readonly dbService: DBService) {}

  // ─── Members ────────────────────────────────────────────────────────────

  async addMember(data: typeof organizationMembers.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(organizationMembers)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to add member');
    return row;
  }

  async removeMember(organizationId: string, userId: string) {
    await this.dbService.db
      .delete(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
        ),
      );
  }

  async findMembersByOrganization(organizationId: string) {
    return this.dbService.db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, organizationId));
  }

  async findOrganizationsByUser(userId: string) {
    return this.dbService.db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, userId));
  }

  async findMemberRole(organizationId: string, userId: string) {
    const [row] = await this.dbService.db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
        ),
      );
    return row ?? null;
  }

  async updateMemberRole(
    organizationId: string,
    userId: string,
    role: string,
  ) {
    const [row] = await this.dbService.db
      .update(organizationMembers)
      .set({ role })
      .where(
        and(
          eq(organizationMembers.organizationId, organizationId),
          eq(organizationMembers.userId, userId),
        ),
      )
      .returning();
    return row ?? null;
  }

  // ─── Invitations ────────────────────────────────────────────────────────

  async createInvitation(data: typeof organizationInvitations.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(organizationInvitations)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create invitation');
    return row;
  }

  async findInvitationByToken(token: string) {
    const [row] = await this.dbService.db
      .select()
      .from(organizationInvitations)
      .where(eq(organizationInvitations.token, token));
    return row ?? null;
  }

  async acceptInvitation(token: string) {
    const [row] = await this.dbService.db
      .update(organizationInvitations)
      .set({ status: 'accepted', acceptedAt: new Date() })
      .where(eq(organizationInvitations.token, token))
      .returning();
    return row ?? null;
  }

  async findPendingInvitations(organizationId: string) {
    return this.dbService.db
      .select()
      .from(organizationInvitations)
      .where(
        and(
          eq(organizationInvitations.organizationId, organizationId),
          eq(organizationInvitations.status, 'pending'),
        ),
      );
  }

  async revokeInvitation(id: string) {
    const [row] = await this.dbService.db
      .update(organizationInvitations)
      .set({ status: 'revoked' })
      .where(eq(organizationInvitations.id, id))
      .returning();
    return row ?? null;
  }
}
