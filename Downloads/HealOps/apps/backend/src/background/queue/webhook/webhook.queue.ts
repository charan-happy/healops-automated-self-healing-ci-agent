import { JobName, QueueName } from '@bg/constants/job.constant';
import { IWebhookDeliveryJob } from '@bg/interfaces/job.interface';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class WebhookQueue {
  private readonly logger = new Logger(WebhookQueue.name);

  constructor(@InjectQueue(QueueName.WEBHOOK) private webhookQueue: Queue) {}

  async addDeliveryJob(data: IWebhookDeliveryJob): Promise<void> {
    this.logger.debug(
      `Adding webhook delivery job for webhook ${data.webhookId}, event ${data.event}`,
    );
    await this.webhookQueue.add(JobName.WEBHOOK_DELIVER, data, {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 10_000, // 10s initial delay, then 20s, 40s, 80s, 160s
      },
    });
  }
}
