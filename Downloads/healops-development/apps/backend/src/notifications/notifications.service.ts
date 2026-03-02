import { Injectable, Logger } from '@nestjs/common';
import { NotificationsRepository } from '@db/repositories/notifications/notifications.repository';
import { PushProvider } from './providers/push.provider';
import {
  NotificationRecord,
  SendNotificationOptions,
} from './interfaces/notification.interface';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly notificationsRepository: NotificationsRepository,
    private readonly pushProvider: PushProvider,
  ) {}

  async send(options: SendNotificationOptions): Promise<NotificationRecord> {
    const record = await this.notificationsRepository.create(options);

    if (options.channel === 'push') {
      await this.sendPushNotification(options);
    }

    return record;
  }

  async getNotifications(
    userId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: NotificationRecord[]; total: number }> {
    return this.notificationsRepository.findByUserId(userId, page, pageSize);
  }

  async markAsRead(id: string, userId: string): Promise<NotificationRecord | null> {
    return this.notificationsRepository.markAsRead(id, userId);
  }

  async markAllAsRead(userId: string): Promise<number> {
    return this.notificationsRepository.markAllAsRead(userId);
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationsRepository.getUnreadCount(userId);
  }

  async registerDevice(
    userId: string,
    token: string,
    platform: 'ios' | 'android' | 'web',
  ): Promise<void> {
    await this.notificationsRepository.registerDeviceToken(userId, token, platform);
  }

  private async sendPushNotification(options: SendNotificationOptions): Promise<void> {
    try {
      const tokens = await this.notificationsRepository.findDeviceTokens(options.userId);

      if (tokens.length === 0) {
        this.logger.debug(
          `No active device tokens found for user ${options.userId}. Skipping push.`,
        );
        return;
      }

      const tokenStrings = tokens.map((t) => t.token);

      const result = await this.pushProvider.sendToDevices({
        title: options.title,
        body: options.body,
        ...(options.data !== undefined ? { data: options.data } : {}),
        tokens: tokenStrings,
      });

      this.logger.debug(
        `Push notification sent to user ${options.userId}: ` +
          `${result.successCount} succeeded, ${result.failureCount} failed`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send push notification to user ${options.userId}: ${(error as Error).message}`,
      );
    }
  }
}
