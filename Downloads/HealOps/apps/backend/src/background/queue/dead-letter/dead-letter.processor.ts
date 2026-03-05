// ─── Dead Letter Queue Processor ────────────────────────────────────────────
// EC-48: Persist to audit logs, send Slack alerts for critical queues,
// increment Prometheus DLQ counter.

import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueName } from '@bg/constants/job.constant';
import { IDLQFailedJobData } from '@bg/interfaces/job.interface';
import { HealopsAuditLogRepository } from '@db/repositories/healops/audit-log.repository';
import { SlackQueueService } from '../slack/slack-queue.service';
import { HealopsMetricsService } from '@metrics/healops-metrics.service';

/** Critical queues that trigger Slack alerts when jobs land in DLQ */
const CRITICAL_QUEUES = new Set<string>([
  QueueName.HEALOPS_REPAIR,
  QueueName.HEALOPS_SLACK,
  QueueName.HEALOPS_WEBHOOK_INGEST,
]);

@Injectable()
@Processor(QueueName.DEAD_LETTER)
export class DeadLetterProcessor extends WorkerHost {
  private readonly logger = new Logger(DeadLetterProcessor.name);

  constructor(
    private readonly auditLogRepository: HealopsAuditLogRepository,
    private readonly slackQueueService: SlackQueueService,
    private readonly healopsMetrics: HealopsMetricsService,
  ) {
    super();
  }

  async process(job: Job<IDLQFailedJobData, unknown, string>): Promise<string> {
    const { originalQueueName, originalJobId, failedReason } = job.data;
    const logString = `Processing DLQ job ${String(job.id)} from original queue: ${originalQueueName}. Original job ID: ${originalJobId}. Reason: ${failedReason}`;
    this.logger.error(logString, 'DeadLetterProcessor');
    if (typeof job.log === 'function') job.log(logString);

    // 1. Persist to audit logs
    try {
      await this.auditLogRepository.createAuditLog({
        entityType: 'dlq_job',
        entityId: '00000000-0000-0000-0000-000000000000', // DLQ jobs don't have a UUID entity
        action: 'dead_letter',
        actorType: 'system',
        metadata: {
          originalQueue: originalQueueName,
          originalJobId,
          failedReason,
          stacktrace: job.data.stacktrace,
          timestamp: job.data.timestamp,
        },
      });
    } catch (err) {
      this.logger.warn(`Failed to persist DLQ audit log: ${(err as Error).message}`);
    }

    // 2. Increment Prometheus counter
    this.healopsMetrics.incrementDlqJobs(originalQueueName);

    // 3. Send Slack alert for critical queues
    if (CRITICAL_QUEUES.has(originalQueueName)) {
      try {
        await this.slackQueueService.enqueueNotification({
          jobId: originalJobId,
          type: 'dlq_alert',
          message: [
            `*DLQ Alert* — Job failed permanently`,
            `Queue: \`${originalQueueName}\``,
            `Job ID: \`${originalJobId}\``,
            `Reason: ${failedReason.slice(0, 500)}`,
          ].join('\n'),
        });
      } catch (err) {
        this.logger.warn(`Failed to enqueue DLQ Slack alert: ${(err as Error).message}`);
      }
    }

    return 'DLQ job processed for review';
  }

  @OnWorkerEvent('active')
  async onActive(job: Job) {
    this.logger.debug(`Job ${String(job.id)} is now active`);
    if (typeof job.log === 'function') job.log(`Job ${String(job.id)} is now active`);
  }

  @OnWorkerEvent('progress')
  async onProgress(job: Job) {
    this.logger.debug(`Job ${String(job.id)} is ${String(job.progress)}% complete`);
    if (typeof job.log === 'function') job.log(`Job ${String(job.id)} is ${String(job.progress)}% complete`);
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    this.logger.debug(`Job ${String(job.id)} has been completed`);
    if (typeof job.log === 'function') job.log(`Job ${String(job.id)} has been completed`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job) {
    const logString = `Job ${String(job.id)} has failed with reason: ${String(job.failedReason)}`;
    this.logger.error(logString);
    this.logger.error(job?.stacktrace);
    if (typeof job.log === 'function') job.log(logString);
  }

  @OnWorkerEvent('stalled')
  async onStalled(job: Job) {
    this.logger.error(`Job ${String(job.id)} has been stalled`);
    if (typeof job.log === 'function') job.log(`Job ${String(job.id)} has been stalled`);
  }

  @OnWorkerEvent('error')
  async onError(job: Job, error: Error) {
    const logString = `Job ${String(job.id)} has failed with worker error: ${error?.message}`;
    this.logger.error(logString);
    if (typeof job.log === 'function') job.log(logString);
  }
}
