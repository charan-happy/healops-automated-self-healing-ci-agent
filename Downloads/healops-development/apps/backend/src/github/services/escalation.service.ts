// ─── Escalation Service ─────────────────────────────────────────────────────
// Creates GitHub Issues when HealOps cannot fix a failure.
//
// Escalation triggers:
// - max_retries: all attempts exhausted
// - circular_fix: same diff produced twice
// - budget_exceeded: token budget depleted
// - unfixable_type: error_types.is_auto_fixable = false
// - low_confidence: Claude confidence < AGENT_MIN_CONFIDENCE
//
// Edge cases handled:
// - EC-47: Rich issue body includes all attempted diffs, validation errors, and next steps
// - 4-hour cooldown to prevent re-triggering on the same branch/error combo
// - Duplicate escalation check — don't create multiple issues for same job

import { Injectable, Logger } from '@nestjs/common';
import { GithubService } from '../github.service';
import { EscalationsRepository } from '@db/repositories/healops/escalations.repository';
import { CostTrackingRepository } from '@db/repositories/healops/cost-tracking.repository';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';

export interface EscalateInput {
  jobId: string;
  repositoryId: string;
  branchName: string;
  failureType: string;
  escalationType: string;
  reason: string;
  installationId?: string;
  owner?: string;
  repo?: string;
}

interface AttemptSummary {
  attemptNumber: number;
  diagnosis: string;
  diffPreview: string;
  validationResult: string;
  tokensUsed: number;
}

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  /** Cooldown duration: 4 hours */
  private static readonly COOLDOWN_MS = 4 * 60 * 60 * 1000;

  constructor(
    private readonly githubService: GithubService,
    private readonly escalationsRepository: EscalationsRepository,
    private readonly costTrackingRepository: CostTrackingRepository,
    private readonly jobsRepository: HealopsJobsRepository,
  ) {}

  async escalate(input: EscalateInput): Promise<string | null> {
    try {
      // 1. Duplicate check — don't escalate same job + type twice
      const existing = await this.escalationsRepository.findEscalationsByJobAndType(
        input.jobId,
        input.escalationType,
      );
      if (existing) {
        this.logger.warn(
          `Escalation already exists for job ${input.jobId} / ${input.escalationType} — skipping`,
        );
        return existing.id;
      }

      // 2. Create escalation record
      const escalation = await this.escalationsRepository.createEscalation({
        jobId: input.jobId,
        escalationType: input.escalationType,
        reason: input.reason,
      });

      // 3. Create 4-hour cooldown to prevent re-triggering
      // Non-fatal: if cooldown creation fails, the escalation is still valid
      try {
        await this.costTrackingRepository.createCooldown({
          repositoryId: input.repositoryId,
          branchName: input.branchName,
          failureType: input.failureType,
          triggeredByJobId: input.jobId,
          cooldownReason: input.escalationType,
          cooldownUntil: new Date(Date.now() + EscalationService.COOLDOWN_MS),
        });
      } catch (cooldownError) {
        this.logger.warn(
          `Failed to create cooldown for escalation ${escalation.id}: ${(cooldownError as Error).message}`,
        );
      }

      // 4. Create GitHub Issue if installation context is available
      if (input.installationId && input.owner && input.repo) {
        const attemptSummaries = await this.gatherAttemptSummaries(input.jobId);
        const issue = await this.githubService.createIssue(
          input.installationId,
          input.owner,
          input.repo,
          {
            title: this.buildIssueTitle(input),
            body: this.buildRichIssueBody(input, attemptSummaries),
            labels: ['healops-escalation', input.escalationType],
          },
        );

        if (issue) {
          await this.escalationsRepository.updateEscalation(escalation.id, {
            externalIssueId: String(issue.number),
            issueUrl: issue.url,
          });
          this.logger.log(`Created GitHub Issue #${String(issue.number)} for escalation`);
        }
      }

      this.logger.log(
        `Escalated job ${input.jobId}: ${input.escalationType} — ${input.reason}`,
      );
      return escalation.id;
    } catch (error) {
      this.logger.error(`Escalation failed: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Gather attempt history for the escalation issue body.
   */
  private async gatherAttemptSummaries(jobId: string): Promise<AttemptSummary[]> {
    try {
      const allAttempts = await this.jobsRepository.findAttemptsByJob(jobId);
      const summaries: AttemptSummary[] = [];

      for (const attempt of allAttempts) {
        const patch = await this.jobsRepository.findPatchByAttempt(attempt.id);
        const validations = await this.jobsRepository.findValidationsByAttempt(attempt.id);

        const analysis = attempt.analysisOutput as Record<string, unknown> | null;
        const diagnosis = analysis
          ? String(analysis['diagnosis'] ?? 'No diagnosis available')
          : 'No diagnosis available';

        const diffPreview = patch?.diffContent
          ? patch.diffContent.slice(0, 1000)
          : 'No patch generated';

        const lastValidation = validations[validations.length - 1];
        const validationResult = lastValidation
          ? `build: ${lastValidation.buildStatus}, tests: ${lastValidation.testStatus}`
          : 'No validation run';

        summaries.push({
          attemptNumber: attempt.attemptNumber,
          diagnosis,
          diffPreview,
          validationResult,
          tokensUsed: attempt.totalTokens,
        });
      }

      return summaries;
    } catch (error) {
      this.logger.warn(`Failed to gather attempt summaries: ${(error as Error).message}`);
      return [];
    }
  }

  private buildIssueTitle(input: EscalateInput): string {
    return `HealOps: Cannot fix [${input.failureType}] on ${input.branchName}`;
  }

  private buildRichIssueBody(
    input: EscalateInput,
    attemptSummaries: AttemptSummary[],
  ): string {
    const sections: string[] = [
      '## HealOps Escalation',
      '',
      '> HealOps was unable to automatically fix this failure. Human intervention is required.',
      '',
      '### Overview',
      '',
      `| Field | Value |`,
      `|-------|-------|`,
      `| **Job ID** | \`${input.jobId}\` |`,
      `| **Escalation Type** | \`${input.escalationType}\` |`,
      `| **Failure Type** | \`${input.failureType}\` |`,
      `| **Branch** | \`${input.branchName}\` |`,
      `| **Attempts** | ${String(attemptSummaries.length)} |`,
      '',
      '### Reason',
      '',
      input.reason,
      '',
    ];

    // Add attempt history
    if (attemptSummaries.length > 0) {
      sections.push('### Attempt History', '');

      for (const attempt of attemptSummaries) {
        const truncatedDiff = attempt.diffPreview.length > 800
          ? attempt.diffPreview.slice(0, 800) + '\n... (truncated)'
          : attempt.diffPreview;

        sections.push(
          `<details>`,
          `<summary>Attempt ${String(attempt.attemptNumber)} — ${attempt.validationResult} (${String(attempt.tokensUsed)} tokens)</summary>`,
          '',
          '**Diagnosis:**',
          attempt.diagnosis,
          '',
          '**Diff:**',
          '```diff',
          truncatedDiff,
          '```',
          '',
          `**Validation:** ${attempt.validationResult}`,
          '',
          '</details>',
          '',
        );
      }
    }

    sections.push(
      '### Recommended Next Steps',
      '',
      this.getNextSteps(input.escalationType),
      '',
      '---',
      `*Escalated by HealOps. Job ID: \`${input.jobId}\`*`,
      '*A 4-hour cooldown has been applied to prevent re-attempts on this branch/error type.*',
    );

    return sections.join('\n');
  }

  private getNextSteps(escalationType: string): string {
    switch (escalationType) {
      case 'max_retries':
        return [
          '1. Review the CI logs and the attempted diffs above',
          '2. The error may require architectural changes that the agent cannot make',
          '3. Consider adding this error pattern to the unfixable types list if it recurs',
        ].join('\n');
      case 'circular_fix':
        return [
          '1. The agent produced the same diff twice — it is stuck in a loop',
          '2. The root cause likely requires a different fix strategy',
          '3. Check if the test expectations need updating rather than the source code',
        ].join('\n');
      case 'budget_exceeded':
        return [
          '1. The token budget was exhausted before a valid fix was found',
          '2. Consider increasing the budget limit if the error is complex',
          '3. Review the attempts above to see if the agent was making progress',
        ].join('\n');
      case 'unfixable_type':
        return [
          '1. This error type is marked as not auto-fixable',
          '2. This is expected — the error requires human judgment',
          '3. If you believe this type can be auto-fixed, update the error_types configuration',
        ].join('\n');
      case 'low_confidence':
        return [
          '1. The agent had low confidence in its fix (below threshold)',
          '2. Review the attempted diff — it may still be partially correct',
          '3. The error may be ambiguous or have multiple valid fix strategies',
        ].join('\n');
      default:
        return [
          '1. Review the CI logs for the failing build',
          '2. Check previous HealOps attempts on this branch',
          '3. Apply the fix manually or adjust the codebase',
        ].join('\n');
    }
  }
}
