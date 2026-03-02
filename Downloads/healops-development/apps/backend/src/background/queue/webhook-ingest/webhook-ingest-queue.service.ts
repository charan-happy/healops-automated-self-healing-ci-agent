import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { JobName, QueueName } from '@bg/constants/job.constant';
import { IWebhookIngestJobData } from '@bg/interfaces/job.interface';

@Injectable()
export class WebhookIngestQueueService {
  private readonly logger = new Logger(WebhookIngestQueueService.name);

  constructor(
    @InjectQueue(QueueName.HEALOPS_WEBHOOK_INGEST)
    private readonly webhookIngestQueue: Queue,
  ) {}

  async enqueueWebhookIngest(data: IWebhookIngestJobData): Promise<void> {
    await this.webhookIngestQueue.add(JobName.WEBHOOK_INGEST, data, {
      jobId: `webhook-ingest-${data.webhookEventId}`,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // 5s base
      },
    });
    this.logger.debug(
      `Webhook ingest enqueued for event ${data.webhookEventId} (${data.eventType})`,
    );
  }
}
