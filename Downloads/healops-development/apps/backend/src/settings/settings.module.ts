// ─── Settings Module ────────────────────────────────────────────────────────
// Post-onboarding CRUD for organization settings: CI providers, SCM providers, etc.

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CiProviderModule } from '../ci-provider/ci-provider.module';
import { CiProviderSettingsController } from './ci-provider-settings.controller';
import { CiProviderSettingsService } from './ci-provider-settings.service';
import { OrganizationSettingsController } from './organization-settings.controller';
import { OrganizationSettingsService } from './organization-settings.service';
import { ScmProviderSettingsController } from './scm-provider-settings.controller';
import { ScmProviderSettingsService } from './scm-provider-settings.service';
import { FeedbackController } from './feedback.controller';
import { BetaSignupController } from './beta-signup.controller';

@Module({
  imports: [ConfigModule, CiProviderModule],
  controllers: [
    CiProviderSettingsController,
    OrganizationSettingsController,
    ScmProviderSettingsController,
    FeedbackController,
    BetaSignupController,
  ],
  providers: [
    CiProviderSettingsService,
    OrganizationSettingsService,
    ScmProviderSettingsService,
  ],
  exports: [
    CiProviderSettingsService,
    OrganizationSettingsService,
    ScmProviderSettingsService,
  ],
})
export class SettingsModule {}
