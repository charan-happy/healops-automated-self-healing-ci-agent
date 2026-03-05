import { CronJobName, QueueName } from '@bg/constants/job.constant';
import { ICronJob } from '@bg/interfaces/job.interface';
import { CronService } from '@cron/cron.service';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';

@Processor(QueueName.CRON, {
  concurrency: 3,
  drainDelay: 300,
  stalledInterval: 300000, // 5 minutes
  maxStalledCount: 3,
  limiter: {
    max: 5,
    duration: 150,
  },
})
export class CronProcessor extends WorkerHost {
  private readonly logger = new Logger(CronProcessor.name);

  constructor(
    private readonly cronService: CronService,
    private readonly dlqService: DeadLetterQueueService
  ) {
    super();
  }

  async process(job: Job<ICronJob, any, string>, _token?: string): Promise<any> {
    let logString_ = `Processing job ${job.id} of type ${job.name} with data ${JSON.stringify(job.data)}...`;
    this.logger.debug(logString_, 'CronProcessor');
    if (typeof job.log === 'function') job.log(logString_);

    try {
      let result;

      switch (job.name) {
        case CronJobName.DAILY_MAIL:
          result = await this.cronService.sendDailyMail(job.data);
          break;
        default:
          throw new Error(`Unknown job name: ${job.name}`);
      }

      logString_ = `Completed job ${job.id} of type ${job.name} with result ${JSON.stringify(result)}`;
      this.logger.debug(logString_, 'CronProcessor');
      if (typeof job.log === 'function') job.log(logString_);

      return result;
    } catch (error) {
      logString_ = `Failed to process job ${job.id} of type ${job.name} with error ${(error as Error)?.message}`;
      this.logger.error(logString_, (error as Error)?.stack, 'CronProcessor');
      if (typeof job.log === 'function') job.log(logString_);
      throw error;
    }
  }

  @OnWorkerEvent('active')
  async onActive(job: Job) {
    this.logger.debug(`Job ${job.id} is now active`);
    if (typeof job.log === 'function') job.log(`Job ${job.id} is now active`);
  }

  @OnWorkerEvent('progress')
  async onProgress(job: Job) {
    this.logger.debug(`Job ${job.id} is ${job.progress}% complete`);
    if (typeof job.log === 'function') job.log(`Job ${job.id} is ${job.progress}% complete`);
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

    // Push the failed job to the Dead Letter Queue
    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.CRON,
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

    // Considering stalled jobs to DLQ if they are consistently stalling
    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.CRON,
      originalJobId: job.id || '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: `Job stalled for too long. Current attempts: ${job?.attemptsMade}`,
      timestamp: Date.now(),
    });
  }

  @OnWorkerEvent('error')
  async onError(job: Job, error: Error) {
    const logString_ = `Job ${job.id} has failed with worker error: ${error?.message}`;
    this.logger.error(logString_);
    if (typeof job.log === 'function') job.log(logString_);

    // Errors to DLQ as well
    await this.dlqService.addFailedJobToDLQ({
      originalQueueName: QueueName.CRON,
      originalJobId: job.id || '',
      originalJobName: job.name,
      originalJobData: job.data,
      failedReason: `Processor error: ${error.message}`,
      stacktrace: error.stack ? error.stack.split('\n') : [],
      timestamp: Date.now(),
    });
  }
}
