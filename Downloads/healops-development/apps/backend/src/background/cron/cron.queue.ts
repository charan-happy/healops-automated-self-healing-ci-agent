import { QueueName } from '@bg/constants/job.constant';
import { CronJobName } from '@bg/constants/job.constant';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class CronQueue {
  private readonly logger = new Logger(CronQueue.name);
  constructor(@InjectQueue(QueueName.CRON) private cronQueue: Queue) {}

  async addDailyMailJob(data?: any) {
    await this.addCronJob(CronJobName.DAILY_MAIL, data);
  }

  private async addCronJob(jobName: CronJobName, data?: any) {
    const job = await this.cronQueue.add(jobName, { jobType: jobName, data });
    this.logger.debug(`Added ${jobName} job with ID ${job.id}`);
    return job;
  }
}
