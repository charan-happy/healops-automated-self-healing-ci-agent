// ─── HealOps Configuration ───────────────────────────────────────────────
// Typed configuration for all HealOps-specific environment variables.
// Uses @nestjs/config registerAs() for namespaced access.

import { registerAs } from '@nestjs/config';

/** Parse an integer from env, returning the fallback if NaN */
function safeParseInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/** Parse a float from env, returning the fallback if NaN */
function safeParseFloat(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}

export interface HealOpsConfig {
  // ─── Application ─────────────────────────────────────────────────────────
  appSecret: string;

  // ─── OpenRouter (LLM) ────────────────────────────────────────────────────
  openRouter: {
    apiKey: string;
    baseUrl: string;
    model: string;
    maxTokens: number;
    temperature: number;
  };

  // ─── GitHub App ──────────────────────────────────────────────────────────
  github: {
    appId: string;
    privateKey: string;
    clientId: string;
    clientSecret: string;
    webhookSecret: string;
  };

  // ─── Slack ───────────────────────────────────────────────────────────────
  slack: {
    webhookUrl: string;
    defaultChannel: string;
  };

  // ─── HealOps API ──────────────────────────────────────────────────────
  api: {
    publicUrl: string;
    webhookApiKey: string;
  };

  // ─── Agent ───────────────────────────────────────────────────────────────
  agent: {
    maxRetries: number;
    minConfidence: number;
    tokenBudgetPerJob: number;
    maxLogSnippetTokens: number;
  };

  // ─── Cost Control ────────────────────────────────────────────────────────
  cost: {
    monthlyTokenBudget: number;
    monthlyJobLimit: number;
    inputPricePerToken: number;
    outputPricePerToken: number;
  };
}

export const healopsConfig = registerAs(
  'healops',
  (): HealOpsConfig => ({
    appSecret: process.env['APP_SECRET'] ?? '',

    openRouter: {
      apiKey: process.env['OPENROUTER_API_KEY'] ?? '',
      baseUrl:
        process.env['OPENROUTER_BASE_URL'] ?? 'https://openrouter.ai/api/v1',
      model:
        process.env['OPENROUTER_MODEL'] ?? 'anthropic/claude-sonnet-4-5',
      maxTokens: safeParseInt(process.env['OPENROUTER_MAX_TOKENS'], 4096),
      temperature: safeParseFloat(process.env['OPENROUTER_TEMPERATURE'], 0.1),
    },

    github: {
      appId: process.env['GITHUB_APP_ID'] ?? '',
      privateKey: (process.env['GITHUB_APP_PRIVATE_KEY'] ?? '').replace(
        /\\n/g,
        '\n',
      ),
      clientId: process.env['GITHUB_CLIENT_ID'] ?? '',
      clientSecret: process.env['GITHUB_CLIENT_SECRET'] ?? '',
      webhookSecret: process.env['GITHUB_WEBHOOK_SECRET'] ?? '',
    },

    slack: {
      webhookUrl: process.env['SLACK_WEBHOOK_URL'] ?? '',
      defaultChannel: process.env['SLACK_DEFAULT_CHANNEL'] ?? '#eng-healops',
    },

    api: {
      publicUrl: process.env['HEALOPS_PUBLIC_URL'] ?? '',
      webhookApiKey: process.env['HEALOPS_WEBHOOK_API_KEY'] ?? '',
    },

    agent: {
      maxRetries: safeParseInt(process.env['AGENT_MAX_RETRIES'], 3),
      minConfidence: safeParseFloat(process.env['AGENT_MIN_CONFIDENCE'], 0.55),
      tokenBudgetPerJob: safeParseInt(process.env['AGENT_TOKEN_BUDGET_PER_JOB'], 100000),
      maxLogSnippetTokens: safeParseInt(process.env['AGENT_MAX_LOG_SNIPPET_TOKENS'], 8000),
    },

    cost: {
      monthlyTokenBudget: safeParseInt(process.env['MONTHLY_TOKEN_BUDGET'], 1000000),
      monthlyJobLimit: safeParseInt(process.env['MONTHLY_JOB_LIMIT'], 500),
      inputPricePerToken: safeParseFloat(process.env['COST_INPUT_PRICE_PER_TOKEN'], 0.000003),
      outputPricePerToken: safeParseFloat(process.env['COST_OUTPUT_PRICE_PER_TOKEN'], 0.000015),
    },
  }),
);
