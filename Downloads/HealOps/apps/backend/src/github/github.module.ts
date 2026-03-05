// ─── GitHub Module ──────────────────────────────────────────────────────────
// Octokit wrapper for GitHub API operations.
// Includes PR creation, escalation (issue creation), and GitHub App auth.

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GithubService } from './github.service';
import { PullRequestService } from './services/pull-request.service';
import { EscalationService } from './services/escalation.service';
import { GithubAppProvider } from './providers/github-app.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    GithubAppProvider,
    GithubService,
    PullRequestService,
    EscalationService,
  ],
  exports: [
    GithubService,
    PullRequestService,
    EscalationService,
  ],
})
export class GithubModule {}
