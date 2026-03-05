// ─── OpenRouter AI Provider ─────────────────────────────────────────────────
// Uses the OpenAI SDK with OpenRouter's base URL (API-compatible).
// Supports chat completions via any model available on OpenRouter.
// Supports embeddings via proxied models (e.g. openai/text-embedding-3-small).

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { AiProvider } from './ai.provider';
import {
  ChatCompletionOptions,
  ChatCompletionResult,
  EmbeddingOptions,
  EmbeddingResult,
  ToolCall,
  ToolDefinition,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class OpenRouterProvider extends AiProvider {
  private readonly logger = new Logger(OpenRouterProvider.name);
  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly defaultEmbeddingModel: string;
  private readonly maxTokens: number;

  constructor(private readonly configService: ConfigService) {
    super();

    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY') ?? '';
    const baseURL =
      this.configService.get<string>('OPENROUTER_BASE_URL') ??
      'https://openrouter.ai/api/v1';
    this.defaultModel =
      this.configService.get<string>('OPENROUTER_MODEL') ??
      'anthropic/claude-sonnet-4-5';
    this.defaultEmbeddingModel =
      this.configService.get<string>('OPENROUTER_EMBEDDING_MODEL') ??
      'openai/text-embedding-3-small';
    this.maxTokens = Number(
      this.configService.get<string>('OPENROUTER_MAX_TOKENS') ?? '4096',
    );

    if (!apiKey) {
      this.logger.warn(
        'OPENROUTER_API_KEY is not configured. OpenRouter calls will fail until it is set.',
      );
    }

    this.client = new OpenAI({
      apiKey,
      baseURL,
      defaultHeaders: {
        'HTTP-Referer':
          this.configService.get<string>('PATCHPILOT_PUBLIC_URL') ?? '',
        'X-Title': 'HealOps',
      },
    });

    this.logger.log(
      `OpenRouter provider initialised — model: ${this.defaultModel}, base: ${baseURL}`,
    );
  }

  get name(): string {
    return 'openrouter';
  }

  // ─── Chat Completion ───────────────────────────────────────────────────────

  async chatCompletion(
    options: ChatCompletionOptions,
  ): Promise<ChatCompletionResult> {
    const model = options.model ?? this.defaultModel;
    const maxTokens = options.maxTokens ?? this.maxTokens;

    try {
      const openaiMessages = this.mapMessages(options.messages);

      const requestParams: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming =
        {
          model,
          messages: openaiMessages,
          max_tokens: maxTokens,
        };

      if (options.temperature !== undefined) {
        requestParams.temperature = options.temperature;
      }
      if (options.tools && options.tools.length > 0) {
        requestParams.tools = this.mapTools(options.tools);
      }

      const response = await this.client.chat.completions.create(requestParams);

      return this.mapResponse(response, model);
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error ? error.message : 'Unknown OpenRouter API error';
      this.logger.error(`OpenRouter chatCompletion failed: ${errMsg}`);
      throw new Error(`OpenRouter chatCompletion failed: ${errMsg}`);
    }
  }

  // ─── Embeddings ────────────────────────────────────────────────────────────

  async embed(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const model = options.model ?? this.defaultEmbeddingModel;

    try {
      const response = await this.client.embeddings.create({
        input: options.input,
        model,
      });

      const embeddings = response.data.map((item) => item.embedding);

      return {
        embeddings,
        model: response.model,
        usage: {
          totalTokens: response.usage.total_tokens,
        },
      };
    } catch (error: unknown) {
      const errMsg =
        error instanceof Error ? error.message : 'Unknown OpenRouter API error';
      this.logger.error(`OpenRouter embed failed: ${errMsg}`);
      throw new Error(`OpenRouter embed failed: ${errMsg}`);
    }
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private mapMessages(
    messages: import('../interfaces/ai-provider.interface').ChatMessage[],
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map(
      (msg): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
        switch (msg.role) {
          case 'system':
            return { role: 'system', content: msg.content };
          case 'user':
            return { role: 'user', content: msg.content };
          case 'assistant':
            return { role: 'assistant', content: msg.content };
          case 'tool':
            return {
              role: 'tool',
              content: msg.content,
              tool_call_id: '',
            };
          default:
            return { role: 'user', content: msg.content };
        }
      },
    );
  }

  private mapTools(
    tools: ToolDefinition[],
  ): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  private mapResponse(
    response: OpenAI.Chat.Completions.ChatCompletion,
    requestedModel: string,
  ): ChatCompletionResult {
    const firstChoice = response.choices[0];
    const message = firstChoice?.message;
    const content = message?.content ?? '';
    const finishReason = firstChoice?.finish_reason ?? 'stop';

    const rawToolCalls = message?.tool_calls;
    const toolCalls: ToolCall[] | undefined =
      rawToolCalls && rawToolCalls.length > 0
        ? rawToolCalls.map((tc) => ({
            id: tc.id,
            name: tc.type === 'function' ? tc.function.name : '',
            arguments: tc.type === 'function' ? tc.function.arguments : '',
          }))
        : undefined;

    const result: ChatCompletionResult = {
      content,
      role: message?.role ?? 'assistant',
      model: response.model ?? requestedModel,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason,
    };

    if (toolCalls !== undefined) {
      result.toolCalls = toolCalls;
    }

    return result;
  }
}
