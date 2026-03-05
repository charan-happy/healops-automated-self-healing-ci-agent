import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  async sendDailyMail(data?: any) {
    this.logger.debug('Sending Daily mail', data);
  }
}
