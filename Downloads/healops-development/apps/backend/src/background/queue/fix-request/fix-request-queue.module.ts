// ─── Fix Request Queue Module ───────────────────────────────────────────────
// Worker-side module for the AI fix pipeline.
// Provides the BullMQ processor, LangGraph-based FixAgentService,
// and supporting services (ErrorClassifierService, SimilarFixService).

import { Module } from '@nestjs/common';
import { AiModule } from '@ai/ai.module';
import { GithubModule } from '@github/github.module';
import { RedisModule } from '@redis/redis.module';
import { CiProviderModule } from '../../../ci-provider/ci-provider.module';
import { FixRequestProcessor } from './fix-request.processor';
import { FixAgentService } from './services/fix-agent.service';
import { ErrorClassifierService } from './services/error-classifier.service';
import { SimilarFixService } from './services/similar-fix.service';

@Module({
  imports: [AiModule, GithubModule, RedisModule, CiProviderModule],
  providers: [
    FixRequestProcessor,
    FixAgentService,
    ErrorClassifierService,
    SimilarFixService,
  ],
})
export class FixRequestQueueModule {}
