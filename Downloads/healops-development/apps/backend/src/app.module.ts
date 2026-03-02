import { QueueUIModule } from '@bg/queue-ui.module';
import { DEFAULT_JOB_OPTIONS, QueuePrefix } from '@bg/constants/job.constant';
import { EnvConfigModule } from '@config/env-config.module';
import { DBModule } from '@db/db.module';
import { HealthModule } from '@health/health.module';
import { HttpLoggingInterceptor } from '@interceptors/logging.interceptor';
import { TransformInterceptor } from '@interceptors/transform.interceptor';
import { ApiVersionInterceptor } from '@interceptors/api-version.interceptor';
import { LoggerModule } from '@logger/logger.module';
import { MetricsModule } from '@metrics/metrics.module';
import { MetricsMiddleware } from '@middlewares/metrics.middleware';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { MiddlewareConsumer, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
// import { DevtoolsModule } from '@nestjs/devtools-integration';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { RedisModule } from '@redis/redis.module';
import { REDIS_CLIENT } from '@redis/redis.provider';
import { Redis } from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from '@config/env.config';
import { ErrorHandlerService } from '@common/services/error-handler.service';
import { DevToolsModule } from './api/dev-tools/dev-tools.module';
import { OtelModule } from '@otel/otel.module';
import { TracingModule } from './api/tracing/tracing.module';
import { DevToolsMiddleware } from '@middlewares/dev-tool.middleware';
import { RouteNames } from '@common/route-names';
import { CookieAuthMiddleware } from '@middlewares/cookies.middleware';

// Auth & Users
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { UsersV2Module } from './users/users-v2.module';

// Media
import { MediaModule } from './media/media.module';

// SMS
import { SmsModule } from './sms/sms.module';

// Email
import { EmailModule } from '@email/email.module';

// Notifications
import { NotificationsModule } from './notifications/notifications.module';

// AI Agents
import { AgentsModule } from './ai/agents/agents.module';
import { FixRequestApiModule } from './background/queue/fix-request/fix-request-api.module';

// Webhooks
import { WebhooksModule } from './webhooks/webhooks.module';

// Common
import { CommonModule } from '@common/common.module';
import { AuditModule } from '@common/audit/audit.module';

// Real-time
import { GatewayModule } from './gateway/gateway.module';

// HealOps — AI-powered CI/CD repair
import { GithubWebhookModule } from './github-webhook/github-webhook.module';
import { RepairJobsModule } from './repair-jobs/repair-jobs.module';
import { RepairAgentModule } from './repair-agent/repair-agent.module';
import { GithubModule } from './github/github.module';
import { ValidatorModule } from './validator/validator.module';
import { SlackModule } from './slack/slack.module';
import { VectorMemoryModule } from './vector-memory/vector-memory.module';
import { CostTrackingModule } from './cost-tracking/cost-tracking.module';
import { PipelineStatusModule } from './pipeline-status/pipeline-status.module';
import { BillingModule } from './billing/billing.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { CiProviderModule } from './ci-provider/ci-provider.module';
import { CiWebhookModule } from './ci-webhook/ci-webhook.module';

import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { PermissionsGuard } from './auth/guards/permissions.guard';

const configService = new ConfigService<EnvConfig>();

// Queue module
const queueModule = BullModule.forRootAsync({
  imports: [RedisModule],
  useFactory: (redisClient: Redis) => {
    return {
      prefix: QueuePrefix.SYSTEM, // For grouping queues
      connection: redisClient.options,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    };
  },
  inject: [REDIS_CLIENT],
});

// Rate Limiting
const rateLimit = ThrottlerModule.forRoot([
  {
    name: 'short',
    ttl: 1 * 60, // Time to live in seconds (1 minute)
    limit: 30, // Maximum number of requests within the ttl
  },
  {
    name: 'medium',
    ttl: 5 * 60, // 5 minutes
    limit: 100,
  },
  {
    name: 'long',
    ttl: 30 * 60, // 30 minutes
    limit: 500,
  },
  {
    name: 'very-long',
    ttl: 60 * 60, // 1 hour
    limit: 1000,
  },
]);

// Cache Module
const cacheModule = CacheModule.registerAsync({
  useFactory: async () => {
    const redisTlsEnabled =
      (configService.get<string>('REDIS_TLS_ENABLED') ?? 'false').toLowerCase() === 'true';

    const store = await redisStore({
      socket: {
        host: configService.get<string>('REDIS_HOST'),
        port: configService.get<number>('REDIS_PORT'),
        tls: redisTlsEnabled,
      },
      password: configService.get<string>('REDIS_PASSWORD'),
    });

    return {
      store: store,
      ttl: 5 * 60000, // Default - 5 minutes (milliseconds)
    };
  },
  isGlobal: true,
});

@Module({
  imports: [
    // DevtoolsModule.register({
    //   http: process.env['NODE_ENV'] !== 'production',
    // }),
    rateLimit,
    cacheModule,
    EnvConfigModule,
    LoggerModule,
    EventEmitterModule.forRoot(),
    RedisModule,
    DBModule,
    OtelModule,
    queueModule,
    QueueUIModule,

    // Auth & Users
    AuthModule,
    UsersModule,
    UsersV2Module,

    // Media
    MediaModule,

    // SMS
    SmsModule,

    // Email
    EmailModule,

    // Notifications
    NotificationsModule,

    // AI Agents
    AgentsModule,
    FixRequestApiModule,

    // Webhooks
    WebhooksModule,

    // Common
    CommonModule,
    AuditModule,

    // Real-time
    GatewayModule,

    // HealOps
    GithubWebhookModule,
    RepairJobsModule,
    RepairAgentModule,
    GithubModule,
    ValidatorModule,
    SlackModule,
    VectorMemoryModule,
    CostTrackingModule,
    PipelineStatusModule,
    BillingModule,
    DashboardModule,
    OnboardingModule,
    CiProviderModule,
    CiWebhookModule,

    // APIs
    MetricsModule,
    HealthModule,
    DevToolsModule,
    TracingModule,
  ],
  providers: [
    ErrorHandlerService,
    DevToolsMiddleware,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    // Guard order: ThrottlerGuard → JwtAuthGuard → RolesGuard → PermissionsGuard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ApiVersionInterceptor,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply to all routes
    consumer.apply(MetricsMiddleware).forRoutes('*');
    consumer.apply(CookieAuthMiddleware).forRoutes('*');
    consumer
      .apply(DevToolsMiddleware)
      .forRoutes(
        RouteNames.DEV_TOOLS,
        `${RouteNames.HEALTH}/${RouteNames.HEALTH_UI}`,
        RouteNames.QUEUES_UI,
        RouteNames.API_DOCS,
      );
  }
}
