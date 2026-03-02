import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DBService } from '@db/db.service';

// Repositories — centralized data access layer
import { AuthRepository } from './repositories/auth/auth.repository';
import { TokenRepository } from './repositories/auth/token.repository';
import { MfaRepository } from './repositories/auth/mfa.repository';
import { ApiKeyRepository } from './repositories/auth/api-key.repository';
import { OAuthRepository } from './repositories/auth/oauth.repository';
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

const repositories = [
  AuthRepository,
  TokenRepository,
  MfaRepository,
  ApiKeyRepository,
  OAuthRepository,
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
];

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DBService, ...repositories],
  exports: [DBService, ...repositories],
})
export class DBModule {}
