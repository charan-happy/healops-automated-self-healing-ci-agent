import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { EnvConfig } from '@config/env.config';
import { StorageProvider } from './storage.provider';
import { UploadResult } from '../interfaces/media.interface';

@Injectable()
export class S3StorageProvider extends StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private readonly configService: ConfigService<EnvConfig>) {
    super();

    this.region = this.configService.get<string>('AWS_S3_REGION' as keyof EnvConfig) ?? 'us-east-1';
    this.bucket = this.configService.get<string>('AWS_S3_BUCKET' as keyof EnvConfig) ?? '';

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID' as keyof EnvConfig) ?? '';
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY' as keyof EnvConfig) ?? '';

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async upload(file: Express.Multer.File, key: string): Promise<UploadResult> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentLength: file.size,
      Metadata: {
        originalName: file.originalname,
      },
    });

    await this.s3Client.send(command);

    const url = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

    this.logger.log(`File uploaded to S3: ${key}`);

    return {
      storageKey: key,
      url,
      thumbnailUrl: null,
    };
  }

  async delete(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await this.s3Client.send(command);

    this.logger.log(`File deleted from S3: ${key}`);
  }

  async getSignedUrl(key: string, expiresIn: number): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    return signedUrl;
  }
}
