import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '@email/email.service';
import { EmailProvider } from '@email/providers/email.provider';
import { SmtpEmailProvider } from '@email/providers/smtp.provider';
import { SesEmailProvider } from '@email/providers/ses.provider';
import { EmailProviderType } from '@email/interfaces/email.interface';

const logger = new Logger('EmailModule');

const emailProviderFactory = {
  provide: EmailProvider,
  useFactory: (configService: ConfigService): EmailProvider => {
    const providerType =
      (configService.get<string>('EMAIL_PROVIDER') as EmailProviderType | undefined) ?? 'smtp';

    logger.log(`Initializing email provider: ${providerType}`);

    switch (providerType) {
      case 'ses':
        return new SesEmailProvider(configService);
      case 'smtp':
      default:
        return new SmtpEmailProvider(configService);
    }
  },
  inject: [ConfigService],
};

@Global()
@Module({
  providers: [emailProviderFactory, EmailService],
  exports: [EmailService, EmailProvider],
})
export class EmailModule {}
