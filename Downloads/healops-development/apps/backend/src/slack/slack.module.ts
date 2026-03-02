// ─── Slack Module ───────────────────────────────────────────────────────────
// Slack Block Kit notifications with thread_ts threading.
// All notifications for a job are threaded under the first message.
//
// Notification types:
// - pipeline_failed: New CI failure detected
// - pre_check_failed: Compilation pre-check failed
// - runner_failed: GitHub Actions validation failed
// - pr_created: Draft PR submitted for review
// - escalated: Manual intervention required
// - superseded: New developer commit supersedes fix
// - budget_exceeded: Token budget depleted
// - flaky_detected: Flaky failure pattern detected

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SlackService } from './slack.service';

@Module({
  imports: [ConfigModule],
  providers: [SlackService],
  exports: [SlackService],
})
export class SlackModule {}
