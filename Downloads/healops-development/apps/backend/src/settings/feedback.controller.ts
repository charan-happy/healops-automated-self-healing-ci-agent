// ─── Feedback Controller ────────────────────────────────────────────────────
// Collects user feedback on agent-generated fixes.
// Stores in audit_log for analysis and used to improve RAG quality.

import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { HealopsAuditLogRepository } from '@db/repositories/healops/audit-log.repository';

interface FeedbackDto {
  jobId: string;
  failureId: string;
  rating: 'helpful' | 'not_helpful';
  comment?: string;
}

@Controller({ path: 'healops/feedback', version: '1' })
@ApiTags('Feedback')
export class FeedbackController {
  private readonly logger = new Logger(FeedbackController.name);

  constructor(
    private readonly auditLogRepository: HealopsAuditLogRepository,
  ) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Submit feedback on an agent fix' })
  async submitFeedback(@Body() dto: FeedbackDto) {
    this.logger.log(
      `Feedback received: job=${dto.jobId} rating=${dto.rating} hasComment=${String(Boolean(dto.comment))}`,
    );

    await this.auditLogRepository.createAuditLog({
      entityType: 'fix_feedback',
      entityId: dto.jobId,
      action: 'feedback.submitted',
      actorType: 'developer',
      metadata: {
        failureId: dto.failureId,
        rating: dto.rating,
        comment: dto.comment ?? '',
      },
    });

    return { received: true };
  }
}
