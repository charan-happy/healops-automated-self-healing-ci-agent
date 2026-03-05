import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DBService } from '@db/db.service';

// Repositories — centralized data access layer
import { AuthRepository } from './repositories/auth/auth.repository';
import { TokenRepository } from './repositories/auth/token.repository';
import { MfaRepository } from './repositories/auth/mfa.repository';
import { ApiKeyRepository } from './repositories/auth/api-key.repository';
import { OAuthRepository } from './repositories/auth/oauth.repository';
import { VerificationTokenRepository } from './repositories/auth/verification-token.repository';
import { PasswordResetTokenRepository } from './repositories/auth/password-reset-token.repository';
import { UsersRepository } from './repositories/users/users.repository';
import { MediaRepository } from './repositories/media/media.repository';
import { NotificationsRepository } from './repositories/notifications/notifications.repository';
import { AgentsRepository } from './repositories/ai/agents.repository';
import { RagRepository } from './repositories/ai/rag.repository';
import { AuditRepository } from './repositories/common/audit.repository';
import { WebhooksRepository } from './repositories/webhooks/webhooks.repository';

// HealOps repositories
import { PlatformRepository } from './repositories/healops/platform.repository';
import { WebhookEventsRepository } from './repositories/healops/webhook-events.repository';
import { FailuresRepository } from './repositories/healops/failures.repository';
import { HealopsJobsRepository } from './repositories/healops/jobs.repository';
import { HealopsPullRequestsRepository } from './repositories/healops/pull-requests.repository';
import { EscalationsRepository } from './repositories/healops/escalations.repository';
import { VectorMemoryRepository } from './repositories/healops/vector-memory.repository';
import { CostTrackingRepository } from './repositories/healops/cost-tracking.repository';
import { HealopsAuditLogRepository } from './repositories/healops/audit-log.repository';
import { FixRequestsRepository } from './repositories/healops/fix-requests.repository';
import { CiProviderConfigsRepository } from './repositories/healops/ci-provider-configs.repository';
import { ScmProviderConfigsRepository } from './repositories/healops/scm-provider-configs.repository';
import { BillingRepository } from './repositories/healops/billing.repository';
import { MembershipRepository } from './repositories/healops/membership.repository';
import { OnboardingRepository } from './repositories/healops/onboarding.repository';
import { NotificationSettingsRepository } from './repositories/healops/notification-settings.repository';
import { DashboardRepository } from './repositories/healops/dashboard.repository';
import { ReviewsRepository } from './repositories/healops/reviews.repository';

const repositories = [
  AuthRepository,
  TokenRepository,
  MfaRepository,
  ApiKeyRepository,
  OAuthRepository,
  VerificationTokenRepository,
  PasswordResetTokenRepository,
  UsersRepository,
  MediaRepository,
  NotificationsRepository,
  AgentsRepository,
  RagRepository,
  AuditRepository,
  WebhooksRepository,
  // HealOps
  PlatformRepository,
  WebhookEventsRepository,
  FailuresRepository,
  HealopsJobsRepository,
  HealopsPullRequestsRepository,
  EscalationsRepository,
  VectorMemoryRepository,
  CostTrackingRepository,
  HealopsAuditLogRepository,
  FixRequestsRepository,
  // New: multi-CI, billing, membership, onboarding
  CiProviderConfigsRepository,
  ScmProviderConfigsRepository,
  BillingRepository,
  MembershipRepository,
  OnboardingRepository,
  NotificationSettingsRepository,
  DashboardRepository,
  ReviewsRepository,
];

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DBService, ...repositories],
  exports: [DBService, ...repositories],
})
export class DBModule {}
