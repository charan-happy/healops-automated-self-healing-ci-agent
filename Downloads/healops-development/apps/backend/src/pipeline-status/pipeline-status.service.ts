import { Injectable } from '@nestjs/common';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { FailuresRepository } from '@db/repositories/healops/failures.repository';
import { HealopsJobsRepository } from '@db/repositories/healops/jobs.repository';
import { HealopsPullRequestsRepository } from '@db/repositories/healops/pull-requests.repository';

@Injectable()
export class PipelineStatusService {
  constructor(
    private readonly platformRepo: PlatformRepository,
    private readonly failuresRepo: FailuresRepository,
    private readonly jobsRepo: HealopsJobsRepository,
    private readonly pullRequestsRepo: HealopsPullRequestsRepository,
  ) {}

  async getStatusByCommitSha(commitSha: string) {
    const runs = await this.platformRepo.findPipelineRunsByCommitSha(commitSha);

    if (runs.length === 0) {
      return null;
    }

    // Use first run for commit-level info (all runs share the same commit)
    const first = runs[0]!;

    const pipelineRuns = await Promise.all(
      runs.map(async (run) => {
        const failureRows = await this.failuresRepo.findFailuresByPipelineRun(
          run.pipelineRunId,
        );

        const failures = await Promise.all(
          failureRows.map(async (failure) => {
            const allJobs = await this.jobsRepo.findJobsByFailure(failure.id);
            const jobRow = allJobs[0] ?? null;

            if (!jobRow) {
              return {
                id: failure.id,
                errorSummary: failure.errorSummary,
                affectedFile: failure.affectedFile,
                affectedLine: failure.affectedLine,
                language: failure.language,
                job: null,
              };
            }

            const attemptRows = await this.jobsRepo.findAttemptsByJob(jobRow.id);
            const pr = await this.pullRequestsRepo.findPullRequestByJob(jobRow.id);

            const attempts = await Promise.all(
              attemptRows.map(async (attempt) => {
                const patch = await this.jobsRepo.findPatchByAttempt(attempt.id);
                const validationRows = await this.jobsRepo.findValidationsByAttempt(attempt.id);

                return {
                  attemptNumber: attempt.attemptNumber,
                  latencyMs: attempt.latencyMs,
                  inputTokens: attempt.inputTokens,
                  outputTokens: attempt.outputTokens,
                  createdAt: attempt.createdAt,
                  patch: patch
                    ? {
                        filesModified: patch.filesModified,
                        patchSize: patch.patchSize,
                      }
                    : null,
                  validations: validationRows.map((v) => ({
                    stage: v.stage,
                    buildStatus: v.buildStatus,
                    testStatus: v.testStatus,
                  })),
                };
              }),
            );

            return {
              id: failure.id,
              errorSummary: failure.errorSummary,
              affectedFile: failure.affectedFile,
              affectedLine: failure.affectedLine,
              language: failure.language,
              job: {
                id: jobRow.id,
                status: jobRow.status,
                classifiedFailureType: jobRow.classifiedFailureType,
                confidence: jobRow.confidence,
                currentRetry: jobRow.currentRetry,
                maxRetries: jobRow.maxRetries,
                totalTokensUsed: jobRow.totalTokensUsed,
                startedAt: jobRow.startedAt,
                completedAt: jobRow.completedAt,
                attempts,
                pullRequest: pr
                  ? {
                      prUrl: pr.prUrl,
                      status: pr.status,
                      sourceBranch: pr.sourceBranch,
                      targetBranch: pr.targetBranch,
                      isDraft: pr.isDraft,
                    }
                  : null,
              },
            };
          }),
        );

        return {
          id: run.pipelineRunId,
          status: run.status,
          workflowName: run.workflowName,
          externalRunId: run.externalRunId,
          logUrl: run.logUrl,
          agentBranch: run.agentBranch,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          createdAt: run.createdAt,
          failures,
        };
      }),
    );

    return {
      commitSha: first.commitSha,
      commitMessage: first.commitMessage,
      commitAuthor: first.commitAuthor,
      repository: first.repoName,
      branch: first.branchName,
      pipelineRuns,
    };
  }

}
