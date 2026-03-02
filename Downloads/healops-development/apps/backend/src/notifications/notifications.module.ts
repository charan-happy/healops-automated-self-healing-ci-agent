import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DBModule } from '@db/db.module';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushProvider } from './providers/push.provider';
import { FcmPushProvider } from './providers/fcm.provider';

@Module({
  imports: [ConfigModule, DBModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: PushProvider,
      useClass: FcmPushProvider,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
