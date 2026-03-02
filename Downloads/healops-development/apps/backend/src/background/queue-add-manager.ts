import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueueName, JobName, DEFAULT_JOB_OPTIONS } from '@bg/constants/job.constant';
import {
  INotificationJob,
  INotificationTopicJob,
  IOtpEmailJob,
  ISendNotificationJob,
} from '@bg/interfaces/job.interface';

@Injectable()
export class AddingJobsToQueueManager {
  private readonly logger = new Logger(AddingJobsToQueueManager.name);
  constructor(
    @InjectQueue(QueueName.EMAIL) private emailQueue: Queue,
    @InjectQueue(QueueName.NOTIFICATION) private notificationQueue: Queue
  ) {}

  async addJob<T>(queue: Queue, jobName: JobName, data: T, options?: any): Promise<void> {
    this.logger.debug(
      `Adding job ${jobName} to queue ${queue.name} with data: ${JSON.stringify(data)}`,
      'AddingJobsToQueueManager'
    );

    try {
      const job = await queue.add(jobName, data, {
        ...DEFAULT_JOB_OPTIONS,
        ...options,
      });
      this.logger.debug(
        `Job ${job.id} added successfully to queue ${queue.name}`,
        'AddingJobsToQueueManager'
      );
    } catch (error) {
      this.logger.error(
        `Error adding job ${jobName} to queue ${queue.name}: ${(error as Error).message}`,
        (error as Error).stack,
        'AddingJobsToQueueManager'
      );
      throw error;
    }
  }

  async addSendNotificationToDeviceJob(jobName: JobName, data: INotificationJob): Promise<void> {
    return this.addJob(this.notificationQueue, jobName, data);
  }

  async addSendNotificationToTopicJob(
    jobName: JobName,
    data: INotificationTopicJob
  ): Promise<void> {
    return this.addJob(this.notificationQueue, jobName, data);
  }

  async addSendNotificationJob(jobName: JobName, data: ISendNotificationJob): Promise<void> {
    return this.addJob(this.notificationQueue, jobName, data);
  }

  async addRegisterationOtpEmailJob(jobName: JobName, data: IOtpEmailJob): Promise<void> {
    return this.addJob(this.emailQueue, jobName, data);
  }

  async addForgotPasswordEmailJob(jobName: JobName, data: IOtpEmailJob): Promise<void> {
    return this.addJob(this.emailQueue, jobName, data);
  }
}
