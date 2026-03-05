import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeAiProvider } from './providers/claude.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { LocalLlmProvider } from './providers/local-llm.provider';
import { AiService } from './ai.service';
import { CircuitBreakerService } from './circuit-breaker.service';

@Module({
  imports: [ConfigModule],
  providers: [
    ClaudeAiProvider,
    OpenAiProvider,
    OpenRouterProvider,
    LocalLlmProvider,
    CircuitBreakerService,
    AiService,
  ],
  exports: [
    AiService,
    ClaudeAiProvider,
    OpenAiProvider,
    OpenRouterProvider,
    LocalLlmProvider,
    CircuitBreakerService,
  ],
})
export class AiModule {}
