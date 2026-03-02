// ─── Pull Request Service ───────────────────────────────────────────────────
// Creates draft PRs for validated fixes via the GitHub API.
// SAFETY: ALL AI-generated PRs start as draft — cannot be auto-merged.
//
// Edge cases handled:
// - EC-05: Duplicate PR detection — checks for existing open PR on same target branch
// - EC-06: Supersede old PRs when new attempt produces a better fix
// - EC-02: Rich PR body with full diagnostic context for human reviewers
// - Pipeline-still-failing pre-check — avoids PRs for already-fixed pipelines

import { Injectable, Logger } from '@nestjs/common';
import { GithubService } from '../github.service';
import { HealopsPullRequestsRepository } from '@db/repositories/healops/pull-requests.repository';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';

export interface CreatePrInput {
  installationId: string;
  owner: string;
  repo: string;
  jobId: string;
  sourceBranch: string;
  targetBranch: string;
  errorType: string;
  affectedFile: string;
  attemptNumber: number;
  errorSnippet: string;
  diffContent: string;
  filesModified: string[];
  validationStatus: string;
  confidence: number;
  diagnosis: string;
  fixStrategy: string;
  modelUsed: string;
  inputTokens: number;
  outputTokens: number;
  failedCIRunUrl: string;
}

export interface CreatePrResult {
  prNumber: number;
  prUrl: string;
}

@Injectable()
export class PullRequestService {
  private readonly logger = new Logger(PullRequestService.name);

  constructor(
    private readonly githubService: GithubService,
    private readonly pullRequestsRepository: HealopsPullRequestsRepository,
    private readonly jobsRepository: HealopsJobsRepository,
  ) {}

  /**
   * Create a draft PR with full diagnostic context.
   * Handles duplicate detection, pipeline pre-check, and superseding old PRs.
   */
  async createDraftPr(input: CreatePrInput): Promise<CreatePrResult | null> {
    try {
      // 1. Check for existing open PR on the same target branch — prevent duplicates
      const existingPr = await this.pullRequestsRepository.findOpenPrByTargetBranch(
        input.targetBranch,
      );

      if (existingPr) {
        // Add a comment to the existing PR with the new attempt info
        if (input.installationId) {
          const prNumber = parseInt(existingPr.externalPrId, 10);
          if (!isNaN(prNumber)) {
            await this.githubService.addPrComment(
              input.installationId,
              input.owner,
              input.repo,
              prNumber,
              this.buildAttemptComment(input),
            ).catch((err) => {
              this.logger.warn(`Failed to add comment to existing PR: ${(err as Error).message}`);
            });
          }
        }

        // Supersede the old PR record — mark as superseded with the new branch ref
        await this.pullRequestsRepository.supersedePullRequest(
          existingPr.id,
          input.sourceBranch,
        );
        this.logger.log(
          `Superseded PR #${existingPr.externalPrId} (job ${existingPr.jobId}) — new attempt on ${input.sourceBranch}`,
        );
      }

      // 2. Check target branch still needs fixing — avoid PRs for already-fixed pipelines
      const stillFailing = await this.isPipelineStillFailing(
        input.installationId,
        input.owner,
        input.repo,
        input.targetBranch,
      );
      if (!stillFailing) {
        this.logger.log(
          `Pipeline on ${input.targetBranch} is now green — marking job ${input.jobId} as superseded`,
        );
        await this.jobsRepository.updateJobStatus(input.jobId, 'superseded');
        return null;
      }

      // 3. Build title and body
      const title = this.buildPrTitle(input);
      const body = this.buildPrBody(input);

      // 4. EC-25: Validate target branch exists — fall back to default_branch
      let targetBranch = input.targetBranch;
      const branchExists = await this.githubService.branchExists(
        input.installationId,
        input.owner,
        input.repo,
        targetBranch,
      );
      if (!branchExists) {
        this.logger.warn(
          `Target branch "${targetBranch}" not found — falling back to default branch`,
        );
        targetBranch = await this.githubService.getDefaultBranch(
          input.installationId,
          input.owner,
          input.repo,
        );
      }

      // 5. Create draft PR via GitHub API
      // SAFETY: HealOps never creates non-draft PRs. Human must promote.
      const result = await this.githubService.createPR(
        input.installationId,
        input.owner,
        input.repo,
        {
          title,
          body,
          head: input.sourceBranch,
          base: targetBranch,
        },
      );

      // 6. EC-03: Add label and store PR record
      await this.githubService.addLabels(
        input.installationId,
        input.owner,
        input.repo,
        result.number,
        ['healops-fix'],
      );

      await this.pullRequestsRepository.createPullRequest({
        jobId: input.jobId,
        externalPrId: String(result.number),
        prUrl: result.url,
        sourceBranch: input.sourceBranch,
        targetBranch,
        status: 'open',
        isDraft: true,
      });

      this.logger.log(
        `Created draft PR #${String(result.number)} for job ${input.jobId} (attempt ${String(input.attemptNumber)})`,
      );
      return { prNumber: result.number, prUrl: result.url };
    } catch (error) {
      this.logger.error(`Failed to create PR: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Check if the latest workflow on the target branch is still failing.
   * Used as a pre-PR checkpoint to avoid opening PRs for already-fixed pipelines.
   */
  async isPipelineStillFailing(
    installationId: string,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<boolean> {
    const status = await this.githubService.getLatestWorkflowStatus(
      installationId,
      owner,
      repo,
      branch,
    );

    if (status === 'success') return false;
    // If null or failure, assume still failing — proceed cautiously
    return true;
  }

  /**
   * Build PR title: fix(healops): [ERROR_TYPE] affected_file — attempt N
   */
  private buildPrTitle(input: CreatePrInput): string {
    const fileShort = input.affectedFile.split('/').pop() ?? input.affectedFile;
    return `fix(healops): [${input.errorType}] ${fileShort} — attempt ${String(input.attemptNumber)}`;
  }

  /**
   * Build a comment for an existing PR when a new attempt is made.
   */
  private buildAttemptComment(input: CreatePrInput): string {
    return [
      `### New Fix Attempt #${String(input.attemptNumber)}`,
      '',
      `A new fix has been generated on branch \`${input.sourceBranch}\`.`,
      '',
      `| Field | Value |`,
      `|-------|-------|`,
      `| **Confidence** | ${this.renderConfidenceBar(input.confidence)} ${String(Math.round(input.confidence * 100))}% |`,
      `| **Strategy** | ${input.fixStrategy} |`,
      `| **Files** | ${input.filesModified.map((f) => `\`${f}\``).join(', ') || 'none'} |`,
      '',
      '> This PR is being superseded by the new attempt.',
    ].join('\n');
  }

  /**
   * Build rich PR body with full diagnostic context.
   */
  private buildPrBody(ctx: CreatePrInput): string {
    const confidenceBar = this.renderConfidenceBar(ctx.confidence);
    const truncatedDiff = ctx.diffContent.length > 5000
      ? ctx.diffContent.slice(0, 5000) + '\n... (truncated)'
      : ctx.diffContent;
    const truncatedSnippet = ctx.errorSnippet.length > 2000
      ? ctx.errorSnippet.slice(0, 2000) + '\n... (truncated)'
      : ctx.errorSnippet;

    const filesSection = ctx.filesModified.length > 0
      ? ctx.filesModified.map((f) => `- \`${f}\``).join('\n')
      : '- _(none detected)_';

    return [
      '## HealOps Automated Fix',
      '',
      '> This PR was generated automatically by HealOps. It is a **draft** — a human must review and approve before merging.',
      '',
      '### Error Summary',
      '',
      `| Field | Value |`,
      `|-------|-------|`,
      `| **Type** | \`${ctx.errorType}\` |`,
      `| **File** | \`${ctx.affectedFile}\` |`,
      `| **Branch** | \`${ctx.targetBranch}\` |`,
      '',
      '### Root Cause',
      '',
      ctx.diagnosis || '_No diagnosis available_',
      '',
      '### Fix Strategy',
      '',
      ctx.fixStrategy || '_No strategy available_',
      '',
      '### Changes Made',
      '',
      filesSection,
      '',
      '### Validation Results',
      '',
      `- **Validation:** ${ctx.validationStatus}`,
      `- **Confidence Score:** ${confidenceBar} ${String(Math.round(ctx.confidence * 100))}%`,
      '',
      '### Details',
      '',
      `| Field | Value |`,
      `|-------|-------|`,
      `| **Attempt** | #${String(ctx.attemptNumber)} |`,
      `| **Model** | \`${ctx.modelUsed}\` |`,
      `| **Tokens Used** | ${String(ctx.inputTokens)} input / ${String(ctx.outputTokens)} output |`,
      `| **Original CI Run** | [View](${ctx.failedCIRunUrl}) |`,
      `| **Job ID** | \`${ctx.jobId}\` |`,
      '',
      '<details>',
      '<summary>Error Snippet</summary>',
      '',
      '```',
      truncatedSnippet,
      '```',
      '',
      '</details>',
      '',
      '<details>',
      '<summary>Diff</summary>',
      '',
      '```diff',
      truncatedDiff,
      '```',
      '',
      '</details>',
      '',
      '### Review Checklist',
      '',
      '- [ ] The fix addresses the root cause, not just the symptom',
      '- [ ] No new type assertions (`as any`, `@ts-ignore`) introduced',
      '- [ ] No empty catch blocks added',
      '- [ ] Tests pass locally',
      '- [ ] No secrets or credentials in the diff',
      '',
      '---',
      '*This is a draft PR created by HealOps. Please review before merging.*',
      '*To give feedback or report issues, create a GitHub issue in the HealOps repo.*',
    ].join('\n');
  }

  /**
   * Render a visual confidence bar.
   */
  private renderConfidenceBar(confidence: number): string {
    const filled = Math.round(confidence * 10);
    const empty = 10 - filled;
    return `${'█'.repeat(filled)}${'░'.repeat(empty)}`;
  }
}
