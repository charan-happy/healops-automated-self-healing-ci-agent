import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EnvConfig } from '@config/env.config';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { StorageProvider } from './providers/storage.provider';
import { S3StorageProvider } from './providers/s3.provider';
import { CloudinaryStorageProvider } from './providers/cloudinary.provider';
import { StorageProviderType } from './interfaces/media.interface';

@Module({
  imports: [ConfigModule],
  controllers: [MediaController],
  providers: [
    MediaService,
    {
      provide: StorageProvider,
      useFactory: (configService: ConfigService<EnvConfig>): StorageProvider => {
        const provider = configService.get<string>('STORAGE_PROVIDER' as keyof EnvConfig) ?? StorageProviderType.S3;

        switch (provider) {
          case StorageProviderType.CLOUDINARY:
            return new CloudinaryStorageProvider(configService);

          case StorageProviderType.S3:
          default:
            return new S3StorageProvider(configService);
        }
      },
      inject: [ConfigService],
    },
  ],
  exports: [MediaService],
})
export class MediaModule {}
