import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobName, QueueName } from '@bg/constants/job.constant';
import { ISlackNotificationJobData } from '@bg/interfaces/job.interface';

@Injectable()
export class SlackQueueService {
  private readonly logger = new Logger(SlackQueueService.name);

  constructor(
    @InjectQueue(QueueName.HEALOPS_SLACK) private readonly slackQueue: Queue,
  ) {}

  async enqueueNotification(data: ISlackNotificationJobData): Promise<void> {
    await this.slackQueue.add(JobName.SLACK_NOTIFICATION, data);
    this.logger.debug(`Slack notification enqueued for job ${data.jobId}: ${data.type}`);
  }
}
