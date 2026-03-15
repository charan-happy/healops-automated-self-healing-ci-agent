// ─── Beta Signup Controller ─────────────────────────────────────────────────
// Collects early beta signups and stores in audit_log.
// Public endpoint — no auth required.

import { Controller, Post, Get, Body, Logger, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HealopsAuditLogRepository } from '@db/repositories/healops/audit-log.repository';
import { randomUUID } from 'crypto';

interface BetaSignupDto {
  email: string;
  name?: string;
  company?: string;
  ciProviders?: string[];
  teamSize?: string;
}

@Controller({ path: 'healops/beta', version: '1' })
@ApiTags('Beta')
export class BetaSignupController {
  private readonly logger = new Logger(BetaSignupController.name);

  constructor(
    private readonly auditLogRepository: HealopsAuditLogRepository,
  ) {}

  @Post('signup')
  @Public()
  @ApiOperation({ summary: 'Submit a beta signup request' })
  async signup(@Body() dto: BetaSignupDto) {
    this.logger.log(`Beta signup: ${dto.email} (${dto.company ?? 'individual'})`);

    await this.auditLogRepository.createAuditLog({
      entityType: 'beta_signup',
      entityId: randomUUID(),
      action: 'beta.signup',
      actorType: 'system',
      metadata: {
        email: dto.email,
        name: dto.name ?? '',
        company: dto.company ?? '',
        ciProviders: dto.ciProviders ?? [],
        teamSize: dto.teamSize ?? '',
        signedUpAt: new Date().toISOString(),
      },
    });

    return { success: true, message: 'Thanks for signing up! We\'ll be in touch.' };
  }

  @Get('signups')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'List beta signups (admin only)' })
  async listSignups() {
    const logs = await this.auditLogRepository.findByAction('beta.signup');
    return logs.map((l) => ({
      id: l.id,
      ...(l.metadata as Record<string, unknown>),
      createdAt: l.createdAt,
    }));
  }
}
