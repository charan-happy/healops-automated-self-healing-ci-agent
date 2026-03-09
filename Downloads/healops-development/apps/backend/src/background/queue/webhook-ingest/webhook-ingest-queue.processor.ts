import { QueueName } from '@bg/constants/job.constant';
import { IWebhookIngestJobData } from '@bg/interfaces/job.interface';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { GithubWebhookService } from '../../../github-webhook/github-webhook.service';
import { CiWebhookService } from '../../../ci-webhook/ci-webhook.service';

@Processor(QueueName.HEALOPS_WEBHOOK_INGEST, {
  concurrency: 3,
  drainDelay: 300,
  stalledInterval: 300000, // 5 minutes
  maxStalledCount: 3,
})
export class WebhookIngestQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookIngestQueueProcessor.name);

  constructor(
    @Inject(forwardRef(() => GithubWebhookService))
    private readonly githubWebhookService: GithubWebhookService,
    @Inject(forwardRef(() => CiWebhookService))
    private readonly ciWebhookService: CiWebhookService,
    private readonly dlqService: DeadLetterQueueService,
  ) {
    super();
  }

  private static readonly PROCESS_TIMEOUT_MS = 60_000; // 60s — fail fast if processEventAsync hangs

  async process(job: Job<IWebhookIngestJobData, any, string>, _token?: string): Promise<any> {
    const { webhookEventId, eventType, payload, repository } = job.data;
    const provider = repository.provider ?? 'github';
    let logString_ = `Processing webhook ingest for event ${webhookEventId} (${eventType}) via ${provider}`;
    this.logger.debug(logString_, 'WebhookIngestQueueProcessor');
    if (typeof job.log === 'function') job.log(logString_);

    try {
      const timeoutPromise = new Promise<never>((_resolve, reject) => {
        setTimeout(
          () => reject(new Error(`Webhook ingest timed out after ${String(WebhookIngestQueueProcessor.PROCESS_TIMEOUT_MS)}ms`)),
          WebhookIngestQueueProcessor.PROCESS_TIMEOUT_MS,
        );
      });

      let processingPromise: Promise<void>;

      if (provider === 'github') {
        // GitHub webhooks — use existing GitHub-specific processing
        processingPromise = this.githubWebhookService.processEventAsync(
          webhookEventId,
          eventType,
          payload,
          repository,
        );
      } else {
        // GitLab, Jenkins, etc. — use provider-agnostic CI webhook processing
        const context: {
          headBranch: string;
          headSha: string;
          externalRunId?: string;
          workflowName?: string;
        } = {
          headBranch: job.data.headBranch ?? repository.defaultBranch,
          headSha: job.data.headSha ?? '',
        };
        if (job.data.externalRunId !== undefined) context.externalRunId = job.data.externalRunId;
        if (job.data.workflowName !== undefined) context.workflowName = job.data.workflowName;
        processingPromise = this.ciWebhookService.processEventAsync(
          webhookEventId,
          eventType,
          repository,
          context,
        );
      }

      await Promise.race([processingPromise, timeoutPromise]);

      logString_ = `Webhook ingest completed for event ${webhookEventId}`;
      this.logger.debug(logString_, 'WebhookIngestQueueProcessor');
      if (typeof job.log === 'function') job.log(logString_);

      return { webhookEventId, eventType, status: 'processed' };
    } catch (error) {
      logString_ = `Webhook ingest failed for event ${webhookEventId}: ${(error as Error)?.message}`;
      this.logger.error(logString_, (error as Error)?.stack, 'WebhookIngestQueueProcessor');
      if (typeof job.log === 'function') job.log(logString_);
      throw error;
    }
  }

  @OnWorkerEvent('active')
  async onActive(job: Job) {
    this.logger.debug(`Job ${job.id} is now active`);
    if (typeof job.log === 'function') job.log(`Job ${job.id} is now active`);
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} has been completed`);
    if (typeof job.log === 'function') job.log(`Job ${job.id} has been completed`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job) {
    const logString_ = `Job ${job.id} has failed with reason: ${job?.failedReason}`;
    this.logger.error(logString_);
    this.logger.error(job?.stacktrace);
    if (typeof job.log === 'function') job.log(logString_);

    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.HEALOPS_WEBHOOK_INGEST,
      originalJobId: job.id || '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: job?.failedReason,
      stacktrace: job?.stacktrace,
      timestamp: Date.now(),
    });
  }

  @OnWorkerEvent('stalled')
  async onStalled(job: Job) {
    this.logger.error(`Job ${job.id} has been stalled`);
    if (typeof job.log === 'function') job.log(`Job ${job.id} has been stalled`);

    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.HEALOPS_WEBHOOK_INGEST,
      originalJobId: job.id || '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: `Job stalled for too long. Current attempts: ${job?.attemptsMade}`,
      timestamp: Date.now(),
    });
  }

  @OnWorkerEvent('error')
  async onError(job: Job, error: Error) {
    const logString_ = `Job ${job.id} has failed with worker error: ${error.message}`;
    this.logger.error(logString_);
    if (typeof job.log === 'function') job.log(logString_);

    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.HEALOPS_WEBHOOK_INGEST,
      originalJobId: job.id || '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: `Processor error: ${error.message}`,
      stacktrace: error.stack ? error.stack.split('\n') : [],
      timestamp: Date.now(),
    });
  }
}
