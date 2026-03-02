import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClaudeAiProvider } from './providers/claude.provider';
import { OpenAiProvider } from './providers/openai.provider';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { LocalLlmProvider } from './providers/local-llm.provider';
import { AiProvider } from './providers/ai.provider';
import {
  ChatCompletionOptions,
  ChatCompletionResult,
  EmbeddingOptions,
  EmbeddingResult,
  StructuredOutputOptions,
} from './interfaces/ai-provider.interface';
import { AiResponse, FallbackAttempt } from './interfaces/ai-response.interface';
import { CircuitBreakerService } from './circuit-breaker.service';

type AiProviderName = 'claude' | 'openai' | 'openrouter' | 'local';

/**
 * Facade service for AI operations.
 *
 * Delegates to the appropriate AI provider (Claude / OpenAI) based on
 * configuration or explicit request. Wraps every result in an AiResponse
 * that includes latency tracking, provider metadata, and token usage.
 *
 * This service makes NO direct database calls; persistence is the
 * responsibility of higher-level services or repositories.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly defaultProvider: AiProviderName;
  private readonly providerMap: Map<string, AiProvider>;

  constructor(
    private readonly configService: ConfigService,
    private readonly claudeProvider: ClaudeAiProvider,
    private readonly openaiProvider: OpenAiProvider,
    private readonly openrouterProvider: OpenRouterProvider,
    private readonly localLlmProvider: LocalLlmProvider,
    private readonly circuitBreaker: CircuitBreakerService,
  ) {
    const configured = this.configService.get<string>('AI_DEFAULT_PROVIDER') ?? 'claude';
    const validProviders: AiProviderName[] = ['claude', 'openai', 'openrouter', 'local'];
    this.defaultProvider = validProviders.includes(configured as AiProviderName)
      ? (configured as AiProviderName)
      : 'claude';

    this.providerMap = new Map<string, AiProvider>([
      ['claude', this.claudeProvider],
      ['openai', this.openaiProvider],
      ['openrouter', this.openrouterProvider],
      ['local', this.localLlmProvider],
    ]);

    this.logger.log(`AI service initialised — default provider: ${this.defaultProvider}`);
  }

  // ─── Chat Completion ───────────────────────────────────────────────────────

  /**
   * Run a chat completion through the specified (or default) provider.
   *
   * @param options  - Messages, model, temperature, tools, etc.
   * @param providerName - Override the default provider for this call.
   * @returns Wrapped AiResponse containing the ChatCompletionResult.
   */
  async chatCompletion(
    options: ChatCompletionOptions,
    providerName?: string,
  ): Promise<AiResponse<ChatCompletionResult>> {
    const provider = this.getProvider(providerName);
    const startMs = Date.now();

    try {
      const result = await provider.chatCompletion(options);
      const latencyMs = Date.now() - startMs;

      this.logger.debug(
        `chatCompletion [${provider.name}] completed in ${String(latencyMs)}ms — ` +
          `tokens: ${String(result.usage.totalTokens)}`,
      );

      return {
        data: result,
        provider: provider.name,
        model: result.model,
        usage: result.usage,
        latencyMs,
      };
    } catch (error: unknown) {
      const latencyMs = Date.now() - startMs;
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `chatCompletion [${provider.name}] failed after ${String(latencyMs)}ms: ${errMsg}`,
      );
      throw error;
    }
  }

  // ─── Embeddings ────────────────────────────────────────────────────────────

  /**
   * Generate vector embeddings for the given input.
   * Uses the default provider if it supports embeddings (OpenAI, OpenRouter),
   * otherwise falls back to 'openai'. Claude does not offer embeddings.
   *
   * @param options  - Input text(s) and optional model override.
   * @param providerName - Provider to use (defaults to current default provider).
   * @returns Wrapped AiResponse containing the EmbeddingResult.
   */
  async embed(
    options: EmbeddingOptions,
    providerName?: string,
  ): Promise<AiResponse<EmbeddingResult>> {
    // Use the default provider for embeddings (OpenRouter and OpenAI both support them).
    // Fall back to 'openai' if the default is 'claude' (no embeddings API) or
    // 'local' without an embedding model configured.
    let resolvedName = providerName ?? this.defaultProvider;
    if (!providerName && (this.defaultProvider === 'claude' || this.defaultProvider === 'local')) {
      resolvedName = 'openai';
    }
    const provider = this.getProvider(resolvedName);
    const startMs = Date.now();

    try {
      const result = await provider.embed(options);
      const latencyMs = Date.now() - startMs;

      this.logger.debug(
        `embed [${provider.name}] completed in ${String(latencyMs)}ms — ` +
          `tokens: ${String(result.usage.totalTokens)}`,
      );

      return {
        data: result,
        provider: provider.name,
        model: result.model,
        usage: {
          promptTokens: result.usage.totalTokens,
          completionTokens: 0,
          totalTokens: result.usage.totalTokens,
        },
        latencyMs,
      };
    } catch (error: unknown) {
      const latencyMs = Date.now() - startMs;
      const errMsg = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `embed [${provider.name}] failed after ${String(latencyMs)}ms: ${errMsg}`,
      );
      throw error;
    }
  }

  // ─── Structured Output ─────────────────────────────────────────────────────

  /**
   * Request a chat completion that conforms to a JSON schema.
   *
   * Works by injecting a system instruction that tells the model to respond
   * with valid JSON matching the supplied schema, then parses the result.
   *
   * @param options  - Messages, JSON schema, and schema name.
   * @param providerName - Override the default provider.
   * @returns Wrapped AiResponse whose data.content is the JSON string.
   */
  async structuredOutput<T = unknown>(
    options: StructuredOutputOptions<T>,
    providerName?: string,
  ): Promise<AiResponse<ChatCompletionResult>> {
    const schemaInstruction =
      `You MUST respond with ONLY valid JSON that conforms to the following JSON schema ` +
      `named "${options.schemaName}":\n\n${JSON.stringify(options.schema, null, 2)}\n\n` +
      `Do not include any text outside the JSON object. Do not use markdown code fences.`;

    // Prepend the schema instruction as a system message.
    const messagesWithSchema = [
      { role: 'system' as const, content: schemaInstruction },
      ...options.messages,
    ];

    const completionOptions: ChatCompletionOptions = {
      messages: messagesWithSchema,
    };

    if (options.model !== undefined) {
      completionOptions.model = options.model;
    }

    return this.chatCompletion(completionOptions, providerName);
  }

  // ─── Fallback Chat Completion ─────────────────────────────────────────────

  /**
   * Run a chat completion with automatic fallback through available providers.
   *
   * Iterates through a prioritised chain of providers, skipping any whose
   * circuit breaker is open. Records success/failure with the circuit breaker
   * so that persistently failing providers are temporarily removed from the pool.
   *
   * @param options       - Messages, model, temperature, tools, etc.
   * @param preferred     - Preferred provider name (placed first in chain).
   * @returns AiResponse with fallbackAttempts metadata.
   */
  async chatCompletionWithFallback(
    options: ChatCompletionOptions,
    preferred?: string,
  ): Promise<AiResponse<ChatCompletionResult>> {
    const chain = this.buildFallbackChain(preferred);
    const attempts: FallbackAttempt[] = [];
    let lastError: unknown;

    for (const providerName of chain) {
      if (!this.circuitBreaker.isAvailable(providerName)) {
        this.logger.debug(`Skipping provider "${providerName}" — circuit OPEN`);
        continue;
      }

      const provider = this.providerMap.get(providerName);
      if (!provider) {
        continue;
      }

      const startMs = Date.now();
      try {
        const result = await provider.chatCompletion(options);
        const latencyMs = Date.now() - startMs;

        this.circuitBreaker.recordSuccess(providerName);

        attempts.push({ providerName, success: true, latencyMs });

        this.logger.debug(
          `chatCompletionWithFallback [${providerName}] succeeded in ` +
            String(latencyMs) + 'ms — tokens: ' + String(result.usage.totalTokens),
        );

        const response: AiResponse<ChatCompletionResult> = {
          data: result,
          provider: providerName,
          model: result.model,
          usage: result.usage,
          latencyMs,
        };

        if (attempts.length > 0) {
          response.fallbackAttempts = attempts;
        }

        return response;
      } catch (error: unknown) {
        const latencyMs = Date.now() - startMs;
        const errMsg = error instanceof Error ? error.message : 'Unknown error';

        this.circuitBreaker.recordFailure(providerName);
        attempts.push({ providerName, success: false, error: errMsg, latencyMs });

        this.logger.warn(
          `chatCompletionWithFallback [${providerName}] failed after ` +
            String(latencyMs) + 'ms: ' + errMsg,
        );

        lastError = error;
      }
    }

    // All providers exhausted
    this.logger.error(
      'chatCompletionWithFallback — all providers failed (' +
        String(attempts.length) + ' attempts)',
    );
    throw lastError ?? new Error('No AI providers available');
  }

  // ─── Fallback Structured Output ─────────────────────────────────────────

  /**
   * Request a structured (JSON schema) completion with provider fallback.
   *
   * Wraps `structuredOutput` logic with the same fallback chain used by
   * `chatCompletionWithFallback`.
   *
   * @param options       - Messages, JSON schema, and schema name.
   * @param preferred     - Preferred provider name.
   * @returns AiResponse with fallbackAttempts metadata.
   */
  async structuredOutputWithFallback<T = unknown>(
    options: StructuredOutputOptions<T>,
    preferred?: string,
  ): Promise<AiResponse<ChatCompletionResult>> {
    const schemaInstruction =
      `You MUST respond with ONLY valid JSON that conforms to the following JSON schema ` +
      `named "${options.schemaName}":\n\n${JSON.stringify(options.schema, null, 2)}\n\n` +
      `Do not include any text outside the JSON object. Do not use markdown code fences.`;

    const messagesWithSchema = [
      { role: 'system' as const, content: schemaInstruction },
      ...options.messages,
    ];

    const completionOptions: ChatCompletionOptions = {
      messages: messagesWithSchema,
    };

    if (options.model !== undefined) {
      completionOptions.model = options.model;
    }

    return this.chatCompletionWithFallback(completionOptions, preferred);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Build a de-duplicated fallback chain starting with the preferred provider
   * (or the configured default), followed by all remaining known providers.
   */
  private buildFallbackChain(preferred?: string): string[] {
    const allProviders: AiProviderName[] = ['claude', 'openai', 'openrouter', 'local'];
    const first = preferred ?? this.defaultProvider;
    const seen = new Set<string>();
    const chain: string[] = [];

    // Preferred / default first
    if (allProviders.includes(first as AiProviderName)) {
      chain.push(first);
      seen.add(first);
    }

    // Then remaining providers in canonical order
    for (const p of allProviders) {
      if (!seen.has(p)) {
        chain.push(p);
        seen.add(p);
      }
    }

    return chain;
  }

  /**
   * Resolve the requested provider by name, falling back to the default.
   * Throws if the provider name is unknown.
   */
  private getProvider(providerName?: string): AiProvider {
    const name = providerName ?? this.defaultProvider;
    const provider = this.providerMap.get(name);

    if (!provider) {
      throw new Error(
        `Unknown AI provider "${name}". Available providers: ${[...this.providerMap.keys()].join(', ')}`,
      );
    }

    return provider;
  }
}
