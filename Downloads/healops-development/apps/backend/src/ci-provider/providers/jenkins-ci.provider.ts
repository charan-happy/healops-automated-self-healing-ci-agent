// ─── Jenkins CI Provider ────────────────────────────────────────────────────
// CI-only provider for Jenkins. SCM operations are not supported — Jenkins
// delegates those to a separate GitHub/GitLab provider.
// Auth: Basic auth with username:apiToken.
// Webhook verification: Token string comparison.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { CiProviderBase } from './ci-provider.base';
import {
  CiConnectionConfig,
  CreateIssueResult,
  CreatePrResult,
  ProviderRepository,
  WebhookPayloadResult,
} from '../interfaces/ci-provider.interface';

const JENKINS_SCM_ERROR =
  'Jenkins is CI-only. SCM operations require a separate provider (github/gitlab).';

@Injectable()
export class JenkinsCiProvider extends CiProviderBase {
  override readonly providerName = 'jenkins';
  private readonly logger = new Logger(JenkinsCiProvider.name);

  constructor(_configService: ConfigService) {
    super();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildClient(config: CiConnectionConfig): AxiosInstance {
    const baseURL = config.serverUrl ?? 'http://localhost:8080';
    // Jenkins uses Basic auth: username:apiToken
    // config.authToken is expected to be "username:apiToken"
    const [username, apiToken] = config.authToken.split(':');
    return axios.create({
      baseURL,
      auth: {
        username: username ?? '',
        password: apiToken ?? '',
      },
      headers: {
        Accept: 'application/json',
      },
      timeout: 30_000,
    });
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  override verifyWebhookSignature(
    _rawBody: string,
    signature: string,
    secret: string,
  ): boolean {
    // Jenkins Generic Webhook Trigger sends a token in the request.
    // Verification is a simple constant-time string comparison.
    try {
      const sigBuf = Buffer.from(signature, 'utf8');
      const secretBuf = Buffer.from(secret, 'utf8');
      if (sigBuf.length !== secretBuf.length) return false;

      let result = 0;
      for (let i = 0; i < sigBuf.length; i++) {
        result |= (sigBuf[i] ?? 0) ^ (secretBuf[i] ?? 0);
      }
      return result === 0;
    } catch {
      return false;
    }
  }

  override parseWebhookPayload(
    _eventType: string,
    payload: Record<string, unknown>,
  ): WebhookPayloadResult | null {
    // Jenkins Generic Webhook Trigger or Notification Plugin payload
    const build = payload['build'] as Record<string, unknown> | undefined;

    // Jenkins Notification Plugin format
    if (build) {
      return this.parseNotificationPluginPayload(payload, build);
    }

    // Jenkins Generic Webhook Trigger format (flatter)
    if (payload['status'] || payload['result']) {
      return this.parseGenericPayload(payload);
    }

    return null;
  }

  private parseNotificationPluginPayload(
    payload: Record<string, unknown>,
    build: Record<string, unknown>,
  ): WebhookPayloadResult | null {
    const phase = String(build['phase'] ?? '');
    const status = String(build['status'] ?? build['result'] ?? '');
    const scm = build['scm'] as Record<string, unknown> | undefined;

    // Only process completed builds
    if (phase !== 'COMPLETED' && phase !== 'FINALIZED') {
      return null;
    }

    let eventType: string;
    if (status === 'FAILURE' || status === 'UNSTABLE') {
      eventType = 'pipeline_failed';
    } else if (status === 'SUCCESS') {
      eventType = 'pipeline_success';
    } else {
      eventType = `jenkins.${status.toLowerCase()}`;
    }

    const fullUrl = String(build['full_url'] ?? build['url'] ?? '');
    const jobName = String(payload['name'] ?? payload['job_name'] ?? '');
    const buildNumber = String(build['number'] ?? '');

    return {
      eventType,
      externalRunId: `${jobName}/${buildNumber}`,
      workflowName: jobName,
      headBranch: String(scm?.['branch'] ?? ''),
      headSha: String(scm?.['commit'] ?? ''),
      conclusion: status.toLowerCase(),
      runUrl: fullUrl || null,
      startedAt: build['timestamp']
        ? new Date(Number(build['timestamp']))
        : null,
      completedAt: new Date(),
      repository: {
        externalId: jobName,
        fullName: jobName,
        owner: '',
        repo: jobName,
        defaultBranch: 'main',
        language: null,
      },
      commitAuthor: null,
      commitMessage: null,
      raw: payload,
    };
  }

  private parseGenericPayload(
    payload: Record<string, unknown>,
  ): WebhookPayloadResult | null {
    const status = String(payload['status'] ?? payload['result'] ?? '');
    const jobName = String(payload['job_name'] ?? payload['name'] ?? '');
    const buildNumber = String(payload['build_number'] ?? payload['number'] ?? '');
    const buildUrl = String(payload['build_url'] ?? payload['url'] ?? '');
    const branch = String(payload['branch'] ?? payload['ref'] ?? '');
    const sha = String(payload['commit'] ?? payload['sha'] ?? '');

    let eventType: string;
    const normalised = status.toUpperCase();
    if (normalised === 'FAILURE' || normalised === 'UNSTABLE') {
      eventType = 'pipeline_failed';
    } else if (normalised === 'SUCCESS') {
      eventType = 'pipeline_success';
    } else {
      eventType = `jenkins.${status.toLowerCase()}`;
    }

    return {
      eventType,
      externalRunId: `${jobName}/${buildNumber}`,
      workflowName: jobName,
      headBranch: branch,
      headSha: sha,
      conclusion: status.toLowerCase(),
      runUrl: buildUrl || null,
      startedAt: null,
      completedAt: new Date(),
      repository: {
        externalId: jobName,
        fullName: jobName,
        owner: '',
        repo: jobName,
        defaultBranch: 'main',
        language: null,
      },
      commitAuthor: null,
      commitMessage: null,
      raw: payload,
    };
  }

  // ─── CI Operations ────────────────────────────────────────────────────────

  override async fetchLogs(
    config: CiConnectionConfig,
    externalRunId: string,
  ): Promise<string | null> {
    const client = this.buildClient(config);

    // externalRunId format: "jobName/buildNumber"
    const [jobName, buildNumber] = externalRunId.split('/');
    if (!jobName || !buildNumber) {
      this.logger.warn(`Invalid Jenkins externalRunId format: ${externalRunId}`);
      return null;
    }

    try {
      const response = await client.get(
        `/job/${encodeURIComponent(jobName)}/${buildNumber}/consoleText`,
        { responseType: 'text' },
      );
      return String(response.data);
    } catch (error) {
      if (this.isNotFound(error)) return null;
      this.logger.error(
        `Failed to fetch Jenkins logs for ${externalRunId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  // ─── Repository Discovery (Not Supported) ────────────────────────────────

  override async listRepositories(
    _authToken: string,
    _serverUrl?: string,
  ): Promise<ProviderRepository[]> {
    return []; // Jenkins is CI-only, repos are listed via the linked SCM provider
  }

  // ─── SCM Operations (Not Supported) ───────────────────────────────────────

  override async fetchFile(
    _config: CiConnectionConfig,
    _path: string,
    _ref: string,
  ): Promise<string | null> {
    throw new Error(JENKINS_SCM_ERROR);
  }

  override async fetchFileTree(
    _config: CiConnectionConfig,
    _ref: string,
  ): Promise<string[]> {
    throw new Error(JENKINS_SCM_ERROR);
  }

  override async createBranch(
    _config: CiConnectionConfig,
    _branchName: string,
    _fromSha: string,
  ): Promise<boolean> {
    throw new Error(JENKINS_SCM_ERROR);
  }

  override async pushFiles(
    _config: CiConnectionConfig,
    _branch: string,
    _files: Array<{ path: string; content: string }>,
    _commitMessage: string,
  ): Promise<string> {
    throw new Error(JENKINS_SCM_ERROR);
  }

  override async createPullRequest(
    _config: CiConnectionConfig,
    _opts: { title: string; body: string; head: string; base: string },
  ): Promise<CreatePrResult> {
    throw new Error(JENKINS_SCM_ERROR);
  }

  override async createIssue(
    _config: CiConnectionConfig,
    _opts: { title: string; body: string; labels: string[] },
  ): Promise<CreateIssueResult> {
    throw new Error(JENKINS_SCM_ERROR);
  }

  override async getDefaultBranch(_config: CiConnectionConfig): Promise<string> {
    throw new Error(JENKINS_SCM_ERROR);
  }

  override async addPrComment(
    _config: CiConnectionConfig,
    _prNumber: number,
    _body: string,
  ): Promise<void> {
    throw new Error(JENKINS_SCM_ERROR);
  }

  override async closePr(
    _config: CiConnectionConfig,
    _prNumber: number,
    _comment?: string,
  ): Promise<void> {
    throw new Error(JENKINS_SCM_ERROR);
  }

  override async deleteBranch(
    _config: CiConnectionConfig,
    _branchName: string,
  ): Promise<void> {
    throw new Error(JENKINS_SCM_ERROR);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private isNotFound(error: unknown): boolean {
    const status = (error as { response?: { status?: number } }).response?.status;
    return status === 404;
  }
}
