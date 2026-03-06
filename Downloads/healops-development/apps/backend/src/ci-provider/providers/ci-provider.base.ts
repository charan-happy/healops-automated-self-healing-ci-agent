// ─── CI Provider Base ───────────────────────────────────────────────────────
// Abstract base class for all CI/SCM providers.
// Concrete implementations: GitHubCiProvider, GitLabCiProvider, JenkinsCiProvider.

import { Injectable } from '@nestjs/common';
import {
  CiConnectionConfig,
  CreateIssueResult,
  CreatePrResult,
  ProviderPipelineRun,
  ProviderRepository,
  WebhookPayloadResult,
} from '../interfaces/ci-provider.interface';

@Injectable()
export abstract class CiProviderBase {
  /** Human-readable provider name (e.g. 'github', 'gitlab', 'jenkins') */
  abstract readonly providerName: string;

  // ─── Webhook ────────────────────────────────────────────────────────────────

  /**
   * Verify the webhook signature/token from the CI provider.
   * @param rawBody - Raw request body as UTF-8 string
   * @param signature - Signature header value (or token)
   * @param secret - Shared secret configured for the webhook
   */
  abstract verifyWebhookSignature(
    rawBody: string,
    signature: string,
    secret: string,
  ): boolean;

  /**
   * Parse a raw webhook payload into the normalised WebhookPayloadResult.
   * Returns null if the event type is not relevant (e.g. not a pipeline event).
   * @param eventType - Provider event type header (e.g. 'workflow_run', 'Pipeline Hook')
   * @param payload - Parsed JSON body
   */
  abstract parseWebhookPayload(
    eventType: string,
    payload: Record<string, unknown>,
  ): WebhookPayloadResult | null;

  // ─── CI Operations ──────────────────────────────────────────────────────────

  /**
   * Fetch CI build/pipeline logs.
   * Returns the raw log text, or null if unavailable.
   */
  abstract fetchLogs(
    config: CiConnectionConfig,
    externalRunId: string,
  ): Promise<string | null>;

  // ─── Repository Discovery ──────────────────────────────────────────────────

  /**
   * List repositories accessible to this provider.
   * Used for project selection after connecting a provider.
   * @param authToken - Pre-resolved auth token
   * @param serverUrl - Optional base URL for self-hosted instances
   */
  abstract listRepositories(
    authToken: string,
    serverUrl?: string,
  ): Promise<ProviderRepository[]>;

  // ─── Pipeline Discovery ────────────────────────────────────────────────────

  /**
   * List recent pipeline/workflow runs for a repository.
   * Used for displaying CI activity in the Projects page.
   */
  abstract listRecentPipelineRuns(
    config: CiConnectionConfig,
    repoFullName: string,
    limit: number,
  ): Promise<ProviderPipelineRun[]>;

  // ─── SCM Operations ─────────────────────────────────────────────────────────

  /**
   * Fetch file content from the repository at a given ref.
   * Returns null if the file does not exist (404).
   */
  abstract fetchFile(
    config: CiConnectionConfig,
    path: string,
    ref: string,
  ): Promise<string | null>;

  /**
   * Fetch the full file tree (list of file paths) at a given ref.
   * Returns an empty array on failure.
   */
  abstract fetchFileTree(
    config: CiConnectionConfig,
    ref: string,
  ): Promise<string[]>;

  /**
   * Create a new branch from a given SHA.
   * Returns true on success (including if the branch already exists).
   */
  abstract createBranch(
    config: CiConnectionConfig,
    branchName: string,
    fromSha: string,
  ): Promise<boolean>;

  /**
   * Push file changes to a branch (create blobs, tree, commit, update ref).
   * Returns the new commit SHA.
   */
  abstract pushFiles(
    config: CiConnectionConfig,
    branch: string,
    files: Array<{ path: string; content: string }>,
    commitMessage: string,
  ): Promise<string>;

  /**
   * Create a pull request / merge request.
   * HealOps creates draft PRs by default.
   */
  abstract createPullRequest(
    config: CiConnectionConfig,
    opts: { title: string; body: string; head: string; base: string },
  ): Promise<CreatePrResult>;

  /**
   * Create an issue for escalation.
   */
  abstract createIssue(
    config: CiConnectionConfig,
    opts: { title: string; body: string; labels: string[] },
  ): Promise<CreateIssueResult>;

  /**
   * Get the default branch name for the repository.
   */
  abstract getDefaultBranch(config: CiConnectionConfig): Promise<string>;

  /**
   * Add a comment to an existing pull request / merge request.
   */
  abstract addPrComment(
    config: CiConnectionConfig,
    prNumber: number,
    body: string,
  ): Promise<void>;

  /**
   * Close a pull request / merge request with an optional comment.
   */
  abstract closePr(
    config: CiConnectionConfig,
    prNumber: number,
    comment?: string,
  ): Promise<void>;

  /**
   * Delete a branch from the remote repository.
   */
  abstract deleteBranch(
    config: CiConnectionConfig,
    branchName: string,
  ): Promise<void>;
}
