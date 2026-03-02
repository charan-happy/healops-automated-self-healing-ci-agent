import { QueueName } from '@bg/constants/job.constant';
import { IRepairJobData } from '@bg/interfaces/job.interface';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DeadLetterQueueService } from '@dead-letter-queue/dead-letter-queue.service';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';
import { RepairAgentService } from '../../../repair-agent/repair-agent.service';
import { EventsGateway } from '../../../gateway/events.gateway';

@Processor(QueueName.HEALOPS_REPAIR, {
  concurrency: 2,
  drainDelay: 300,
  stalledInterval: 300000, // 5 minutes
  maxStalledCount: 3,
})
export class RepairQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(RepairQueueProcessor.name);

  constructor(
    private readonly jobsRepository: HealopsJobsRepository,
    private readonly dlqService: DeadLetterQueueService,
    private readonly repairAgentService: RepairAgentService,
    private readonly eventsGateway: EventsGateway,
  ) {
    super();
  }

  async process(job: Job<IRepairJobData, unknown, string>, _token?: string): Promise<unknown> {
    const { jobId, failureId } = job.data;
    let logString_ = `Processing repair job ${jobId} for failure ${failureId}`;
    this.logger.debug(logString_, 'RepairQueueProcessor');
    if (typeof job.log === 'function') job.log(logString_);

    try {
      // Mark job as running
      await this.jobsRepository.updateJobStatus(jobId, 'running');

      // Invoke LangGraph agent via RepairAgentService
      const result = await this.repairAgentService.runRepair(jobId, failureId);

      // Determine final status from agent result
      let finalStatus: string;
      if (!result || result.finalStatus === 'escalate') {
        finalStatus = 'escalated';
      } else if (result.finalStatus === 'success') {
        finalStatus = 'success';
      } else {
        finalStatus = 'failed';
      }

      await this.jobsRepository.updateJobStatus(jobId, finalStatus);

      logString_ = `Repair job ${jobId} completed with status: ${finalStatus}`;
      this.logger.debug(logString_, 'RepairQueueProcessor');
      if (typeof job.log === 'function') job.log(logString_);

      return { jobId, status: finalStatus };
    } catch (error) {
      logString_ = `Repair job ${jobId} failed: ${(error as Error)?.message}`;
      this.logger.error(logString_, (error as Error)?.stack, 'RepairQueueProcessor');
      if (typeof job.log === 'function') job.log(logString_);
      await this.jobsRepository.updateJobStatus(jobId, 'failed');
      throw error;
    }
  }

  @OnWorkerEvent('active')
  async onActive(job: Job<IRepairJobData>) {
    this.logger.debug(`Job ${job.id} is now active`);
    if (typeof job.log === 'function') job.log(`Job ${job.id} is now active`);
    this.eventsGateway.emitToAll('repair:started', {
      jobId: job.data.jobId,
      failureId: job.data.failureId,
    });
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: Job<IRepairJobData>) {
    this.logger.debug(`Job ${job.id} has been completed`);
    if (typeof job.log === 'function') job.log(`Job ${job.id} has been completed`);
    const result = job.returnvalue as { jobId?: string; status?: string } | undefined;
    this.eventsGateway.emitToAll('repair:completed', {
      jobId: job.data.jobId,
      status: result?.status ?? 'completed',
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<IRepairJobData>) {
    const logString_ = `Job ${job.id} has failed with reason: ${job?.failedReason}`;
    this.logger.error(logString_);
    this.logger.error(job?.stacktrace);
    this.eventsGateway.emitToAll('repair:failed', {
      jobId: job.data.jobId,
      reason: job?.failedReason ?? 'Unknown error',
    });

    try {
      await this.dlqService.addFailedJobToDLQ({
        originalQueueName: QueueName.HEALOPS_REPAIR,
        originalJobId: job.id || '',
        originalJobName: job.name,
        originalJobData: job.data,
        failedReason: job?.failedReason,
        stacktrace: job?.stacktrace,
        timestamp: Date.now(),
      });
    } catch (dlqError) {
      this.logger.error(
        `Failed to route job ${job.id} to DLQ: ${(dlqError as Error).message}`,
      );
    }
  }

  @OnWorkerEvent('stalled')
  async onStalled(job: Job) {
    this.logger.error(`Job ${job.id} has been stalled`);
    if (typeof job.log === 'function') job.log(`Job ${job.id} has been stalled`);

    try {
      await this.dlqService.addFailedJobToDLQ({
        originalQueueName: QueueName.HEALOPS_REPAIR,
        originalJobId: job.id || '',
        originalJobName: job.name,
        originalJobData: job.data,
        failedReason: `Job stalled for too long. Current attempts: ${job?.attemptsMade}`,
        timestamp: Date.now(),
      });
    } catch (dlqError) {
      this.logger.error(
        `Failed to route stalled job ${job.id} to DLQ: ${(dlqError as Error).message}`,
      );
    }
  }

  /**
   * Worker-level error handler.
   * NOTE: BullMQ's 'error' event receives only (error: Error), not (job, error).
   */
  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`Worker error: ${error.message}`, error.stack);
  }
}
