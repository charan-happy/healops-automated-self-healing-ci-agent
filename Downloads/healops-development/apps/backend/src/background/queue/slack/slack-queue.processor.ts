import { QueueName } from '@bg/constants/job.constant';
import { ISlackNotificationJobData } from '@bg/interfaces/job.interface';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { SlackService } from '../../../slack/slack.service';

@Processor(QueueName.HEALOPS_SLACK, {
  concurrency: 2,
  drainDelay: 300,
  stalledInterval: 300000, // 5 minutes
  maxStalledCount: 3,
})
export class SlackQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(SlackQueueProcessor.name);

  constructor(
    private readonly slackService: SlackService,
    private readonly dlqService: DeadLetterQueueService,
  ) {
    super();
  }

  async process(job: Job<ISlackNotificationJobData, any, string>, _token?: string): Promise<any> {
    const { jobId, type, message, channel } = job.data;
    let logString_ = `Processing slack notification for job ${jobId}: ${type}`;
    this.logger.debug(logString_, 'SlackQueueProcessor');
    if (typeof job.log === 'function') job.log(logString_);

    try {
      await this.slackService.notify(jobId, type, message, channel);

      logString_ = `Slack notification sent for job ${jobId}: ${type}`;
      this.logger.debug(logString_, 'SlackQueueProcessor');
      if (typeof job.log === 'function') job.log(logString_);

      return { jobId, type, status: 'sent' };
    } catch (error) {
      logString_ = `Slack notification failed for job ${jobId}: ${(error as Error)?.message}`;
      this.logger.error(logString_, (error as Error)?.stack, 'SlackQueueProcessor');
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
      originalQueueName: QueueName.HEALOPS_SLACK,
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
      originalQueueName: QueueName.HEALOPS_SLACK,
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
      originalQueueName: QueueName.HEALOPS_SLACK,
      originalJobId: job.id || '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: `Processor error: ${error.message}`,
      stacktrace: error.stack ? error.stack.split('\n') : [],
      timestamp: Date.now(),
    });
  }
}
