// ─── Settings Module ────────────────────────────────────────────────────────
// Post-onboarding CRUD for organization settings: CI providers, etc.

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CiProviderModule } from '../ci-provider/ci-provider.module';
import { CiProviderSettingsController } from './ci-provider-settings.controller';
import { CiProviderSettingsService } from './ci-provider-settings.service';
import { FeedbackController } from './feedback.controller';
import { BetaSignupController } from './beta-signup.controller';

@Module({
  imports: [ConfigModule, CiProviderModule],
  controllers: [CiProviderSettingsController, FeedbackController, BetaSignupController],
  providers: [CiProviderSettingsService],
  exports: [CiProviderSettingsService],
})
export class SettingsModule {}
