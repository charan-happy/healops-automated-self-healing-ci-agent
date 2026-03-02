// ─── Slack Service ──────────────────────────────────────────────────────────
// Sends Block Kit messages to Slack via Incoming Webhooks.
// Maintains thread_ts for follow-up messages on the same job.
//
// Edge cases handled:
// - EC-47: Rate limiting — 5-minute dedup window per job+type
// - Typed message formatting for each notification type
// - Thread management — all messages for a job thread under the first message

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealopsAuditLogRepository } from '@db/repositories/healops/audit-log.repository';

/** Known notification types with structured formatting */
export type SlackNotificationType =
  | 'pipeline_failed'
  | 'pr_created'
  | 'escalated'
  | 'budget_exceeded'
  | 'flaky_detected'
  | 'user_fixed'
  | 'validation_passed'
  | 'validation_failed';

export interface SlackMessageContext {
  jobId: string;
  repoName?: string;
  branch?: string;
  errorType?: string;
  prUrl?: string;
  prNumber?: string;
  escalationType?: string;
  attemptNumber?: number;
  confidence?: number;
  budgetUsed?: string;
  budgetLimit?: string;
}

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);

  /** In-memory rate limit tracker: key = `${jobId}:${type}`, value = timestamp */
  private readonly recentNotifications = new Map<string, number>();

  /** Rate limit window: 5 minutes */
  private static readonly RATE_LIMIT_MS = 5 * 60 * 1000;

  constructor(
    private readonly configService: ConfigService,
    private readonly auditLogRepository: HealopsAuditLogRepository,
  ) {}

  /**
   * Send a typed Slack notification for a HealOps event.
   * Automatically threads follow-ups under the first message for a job.
   * Rate-limited: same job+type combo throttled for 5 minutes.
   */
  async notify(
    jobId: string,
    type: string,
    message: string,
    channel?: string,
  ): Promise<void> {
    const webhookUrl =
      channel ??
      this.configService.get<string>('SLACK_DEFAULT_CHANNEL') ??
      '';

    if (!webhookUrl) {
      this.logger.warn('No Slack webhook URL configured — skipping notification');
      return;
    }

    // Rate limit check — prevent duplicate notifications within 5-min window
    if (this.isRateLimited(jobId, type)) {
      this.logger.debug(
        `Slack notification throttled for job ${jobId}: ${type} (within 5-min window)`,
      );
      await this.auditLogRepository.createSlackNotification({
        jobId,
        type,
        channel,
        status: 'throttled',
        messagePreview: message.slice(0, 200),
        payload: { text: message },
      });
      return;
    }

    // Look up existing thread_ts for this job
    const existingThreadTs = await this.auditLogRepository.findSlackThreadTs(jobId);

    const payload: Record<string, unknown> = {
      text: message,
      ...(existingThreadTs ? { thread_ts: existingThreadTs } : {}),
    };

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack API returned ${String(response.status)}`);
      }

      // Record rate limit timestamp
      this.recordNotification(jobId, type);

      // Store notification record for threading
      await this.auditLogRepository.createSlackNotification({
        jobId,
        type,
        channel,
        status: 'sent',
        slackThreadTs: existingThreadTs,
        messagePreview: message.slice(0, 200),
        payload,
      });

      this.logger.debug(`Slack notification sent for job ${jobId}: ${type}`);
    } catch (error) {
      this.logger.error(`Slack notification failed: ${(error as Error).message}`);

      await this.auditLogRepository.createSlackNotification({
        jobId,
        type,
        channel,
        status: 'failed',
        messagePreview: message.slice(0, 200),
        payload,
      });
    }
  }

  /**
   * Send a typed notification with structured formatting.
   * Use this instead of raw notify() for consistent message formatting.
   */
  async notifyTyped(
    type: SlackNotificationType,
    ctx: SlackMessageContext,
    channel?: string,
  ): Promise<void> {
    const message = this.formatMessage(type, ctx);
    await this.notify(ctx.jobId, type, message, channel);
  }

  /**
   * Format a notification message based on type.
   */
  private formatMessage(type: SlackNotificationType, ctx: SlackMessageContext): string {
    const repo = ctx.repoName ?? 'unknown';
    const branch = ctx.branch ?? 'unknown';

    switch (type) {
      case 'pipeline_failed':
        return [
          `🔴 *Pipeline Failed* — \`${repo}\``,
          `Branch: \`${branch}\``,
          `Error: \`${ctx.errorType ?? 'unknown'}\``,
          `Job: \`${ctx.jobId}\``,
          `HealOps is investigating...`,
        ].join('\n');

      case 'pr_created':
        return [
          `🟢 *Draft PR Created* — \`${repo}\``,
          `PR: <${ctx.prUrl ?? '#'}|#${ctx.prNumber ?? '?'}>`,
          `Branch: \`${branch}\``,
          `Attempt: ${String(ctx.attemptNumber ?? 1)}`,
          `Confidence: ${String(Math.round((ctx.confidence ?? 0) * 100))}%`,
          `Please review and merge if the fix looks correct.`,
        ].join('\n');

      case 'escalated':
        return [
          `🟠 *Escalated* — \`${repo}\``,
          `Reason: \`${ctx.escalationType ?? 'unknown'}\``,
          `Branch: \`${branch}\``,
          `Job: \`${ctx.jobId}\``,
          `HealOps could not fix this automatically. A GitHub Issue has been created.`,
        ].join('\n');

      case 'budget_exceeded':
        return [
          `💰 *Budget Exceeded* — \`${repo}\``,
          `Used: $${ctx.budgetUsed ?? '?'} / $${ctx.budgetLimit ?? '?'}`,
          `Job: \`${ctx.jobId}\``,
          `No further repairs will be attempted until the budget is increased.`,
        ].join('\n');

      case 'flaky_detected':
        return [
          `🔄 *Flaky Test Detected* — \`${repo}\``,
          `Branch: \`${branch}\``,
          `Error: \`${ctx.errorType ?? 'unknown'}\``,
          `Job: \`${ctx.jobId}\``,
          `Pipeline passed on retry — flagging as flaky.`,
        ].join('\n');

      case 'user_fixed':
        return [
          `ℹ️ *Pipeline Green* — \`${repo}\``,
          `Branch: \`${branch}\``,
          `Job: \`${ctx.jobId}\``,
          `Someone already fixed it. Agent standing down.`,
        ].join('\n');

      case 'validation_passed':
        return [
          `✅ *Validation Passed* — \`${repo}\``,
          `Branch: \`${branch}\``,
          `Attempt: ${String(ctx.attemptNumber ?? 1)}`,
          `Job: \`${ctx.jobId}\``,
          `Fix validated successfully. Creating draft PR...`,
        ].join('\n');

      case 'validation_failed':
        return [
          `❌ *Validation Failed* — \`${repo}\``,
          `Branch: \`${branch}\``,
          `Attempt: ${String(ctx.attemptNumber ?? 1)}`,
          `Job: \`${ctx.jobId}\``,
          `Fix did not pass CI. Retrying...`,
        ].join('\n');

      default: {
        const _exhaustive: never = type;
        return `HealOps notification: ${String(_exhaustive)}`;
      }
    }
  }

  /**
   * Check if a notification was sent recently for the same job+type.
   */
  private isRateLimited(jobId: string, type: string): boolean {
    const key = `${jobId}:${type}`;
    const lastSent = this.recentNotifications.get(key);
    if (!lastSent) return false;
    return Date.now() - lastSent < SlackService.RATE_LIMIT_MS;
  }

  /**
   * Record that a notification was sent for rate limiting.
   */
  private recordNotification(jobId: string, type: string): void {
    const key = `${jobId}:${type}`;
    this.recentNotifications.set(key, Date.now());

    // Housekeeping: clean up old entries to prevent memory leak
    if (this.recentNotifications.size > 1000) {
      const cutoff = Date.now() - SlackService.RATE_LIMIT_MS;
      for (const [k, v] of this.recentNotifications) {
        if (v < cutoff) {
          this.recentNotifications.delete(k);
        }
      }
    }
  }
}
