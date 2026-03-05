// ─── Onboarding Module ──────────────────────────────────────────────────────
// Multi-step onboarding flow for new organizations: create org, configure CI
// provider, select repositories, and configure LLM settings.

import { Module } from '@nestjs/common';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';

@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
