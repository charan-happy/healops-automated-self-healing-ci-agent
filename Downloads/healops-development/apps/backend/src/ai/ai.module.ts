import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeAiProvider } from './providers/claude.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { AiService } from './ai.service';

@Module({
  imports: [ConfigModule],
  providers: [ClaudeAiProvider, OpenAiProvider, OpenRouterProvider, AiService],
  exports: [AiService, ClaudeAiProvider, OpenAiProvider, OpenRouterProvider],
})
export class AiModule {}
