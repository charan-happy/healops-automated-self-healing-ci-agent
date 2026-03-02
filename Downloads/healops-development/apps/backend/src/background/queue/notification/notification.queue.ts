import { JobName, QueueName } from '@bg/constants/job.constant';
import {
  INotificationJob,
  INotificationTopicJob,
  ISendNotificationJob,
} from '@bg/interfaces/job.interface';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class NotificationQueue {
  private readonly logger = new Logger(NotificationQueue.name);
  constructor(
    @InjectQueue(QueueName.NOTIFICATION) private notificationQueue: Queue,
  ) {}

  async addSendNotificationToDeviceJob(data: INotificationJob): Promise<void> {
    this.logger.debug(
      `Sending notification job for ${data.deviceTokens}, subject ${data.subject}, message ${data.message}, url ${data.url}, additional data ${data.data}`,
    );
    await this.notificationQueue.add(JobName.NOTIFICATION_TO_DEVICE, data);
  }

  async addSendNotificationToTopicJob(
    data: INotificationTopicJob,
  ): Promise<void> {
    this.logger.debug(
      `Sending notification job for ${data.topic}, subject ${data.subject}, message ${data.message}, url ${data.url}, additional data ${data.data}`,
    );
    await this.notificationQueue.add(JobName.NOTIFICATION_TO_TOPIC, data);
  }

  async addSendNotificationJob(data: ISendNotificationJob): Promise<void> {
    this.logger.debug(
      `Sending notification job for ${data.user_ids}, subject ${data.subject}, message ${data.message}, url ${data.url}`,
    );
    await this.notificationQueue.add(JobName.NOTIFICATION_SEND, data);
  }
}
