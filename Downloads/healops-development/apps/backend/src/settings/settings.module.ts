// ─── Settings Module ────────────────────────────────────────────────────────
// Post-onboarding CRUD for organization settings: CI providers, org, members, etc.

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CiProviderModule } from '../ci-provider/ci-provider.module';
import { AuthModule } from '../auth/auth.module';
import { CiProviderSettingsController } from './ci-provider-settings.controller';
import { CiProviderSettingsService } from './ci-provider-settings.service';
import { ScmProviderSettingsController } from './scm-provider-settings.controller';
import { ScmProviderSettingsService } from './scm-provider-settings.service';
import { OrganizationSettingsController } from './organization-settings.controller';
import { OrganizationSettingsService } from './organization-settings.service';
import { GeneralSettingsController } from './general-settings.controller';
import { FeedbackController } from './feedback.controller';
import { BetaSignupController } from './beta-signup.controller';

@Module({
  imports: [ConfigModule, CiProviderModule, AuthModule],
  controllers: [
    CiProviderSettingsController,
    ScmProviderSettingsController,
    OrganizationSettingsController,
    GeneralSettingsController,
    FeedbackController,
    BetaSignupController,
  ],
  providers: [CiProviderSettingsService, ScmProviderSettingsService, OrganizationSettingsService],
  exports: [CiProviderSettingsService, ScmProviderSettingsService, OrganizationSettingsService],
})
export class SettingsModule {}
