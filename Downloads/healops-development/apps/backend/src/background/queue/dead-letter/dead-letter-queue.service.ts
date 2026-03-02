import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { JobName, QueueName } from '@bg/constants/job.constant';
import { IDLQFailedJobData } from '@bg/interfaces/job.interface';

@Injectable()
export class DeadLetterQueueService {
  private readonly logger = new Logger(DeadLetterQueueService.name);

  constructor(
    @InjectQueue(QueueName.DEAD_LETTER) private readonly dlq: Queue,
  ) {}

  async addFailedJobToDLQ(data: IDLQFailedJobData): Promise<void> {
    this.logger.warn(
      `Adding failed job to DLQ: ${data.originalJobId} from ${data.originalQueueName}`,
    );
    await this.dlq.add(JobName.DLQ_FAILED_JOB, data);
  }
}
