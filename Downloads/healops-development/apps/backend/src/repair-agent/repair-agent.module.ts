// ─── Repair Agent Module ────────────────────────────────────────────────────
// Unified LangGraph repair pipeline — the core of HealOps.
//
// Imports all required modules for the full pipeline:
// - AiModule: LLM calls (chat completion, embeddings, structured output)
// - GithubModule: Push branches, create PRs, escalation issues
// - VectorMemoryModule: RAG — find similar past fixes
// - ValidatorModule: Pre-check compilation (tsc/python/go)
//
// Internal services:
// - PromptBuilderService: 5-layer structured prompt assembly
// - LogParserService: CI log parsing + 26-type regex classification
// - ClassifierService: Error classification with DB lookup
// - QualityGateService: 15-rule deterministic validation

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiModule } from '@ai/ai.module';
import { GithubModule } from '../github/github.module';
import { CiProviderModule } from '../ci-provider/ci-provider.module';
import { VectorMemoryModule } from '../vector-memory/vector-memory.module';
import { ValidatorModule } from '../validator/validator.module';
import { GatewayModule } from '../gateway/gateway.module';
import { MetricsModule } from '../api/metrics/metrics.module';
import { RepairAgentService } from './repair-agent.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import { LogParserService } from './services/log-parser.service';
import { ClassifierService } from './services/classifier.service';
import { QualityGateService } from './services/quality-gate.service';

@Module({
  imports: [
    ConfigModule,
    AiModule,
    GithubModule,
    CiProviderModule,
    VectorMemoryModule,
    ValidatorModule,
    GatewayModule,
    MetricsModule,
  ],
  providers: [
    RepairAgentService,
    PromptBuilderService,
    LogParserService,
    ClassifierService,
    QualityGateService,
  ],
  exports: [
    RepairAgentService,
    PromptBuilderService,
    LogParserService,
    ClassifierService,
    QualityGateService,
  ],
})
export class RepairAgentModule {}
