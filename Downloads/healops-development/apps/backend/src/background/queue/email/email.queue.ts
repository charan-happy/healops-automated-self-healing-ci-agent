import { JobName, QueueName } from '@bg/constants/job.constant';
import { IOtpEmailJob } from '@bg/interfaces/job.interface';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

@Injectable()
export class EmailQueue {
  private readonly logger = new Logger(EmailQueue.name);

  constructor(@InjectQueue(QueueName.EMAIL) private emailQueue: Queue) {}

  async addOTPEmailJob(data: IOtpEmailJob): Promise<void> {
    this.logger.debug(`Adding otp email job for ${data.email}`);
    await this.emailQueue.add(JobName.OTP_EMAIL_VERIFICATION, data);
  }
}
