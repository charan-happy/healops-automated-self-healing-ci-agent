// ─── GitLab CI Provider ─────────────────────────────────────────────────────
// Full CI + SCM provider for GitLab, using the GitLab REST API via axios.
// Auth: PRIVATE-TOKEN header (personal access token or project token).
// Webhook verification: X-Gitlab-Token header comparison.
//
// Note: For GitLab, config.owner is unused; config.repo is the project ID
// or URL-encoded project path (e.g. "group%2Fproject").

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { CiProviderBase } from './ci-provider.base';
import {
  CiConnectionConfig,
  CreateIssueResult,
  CreatePrResult,
  ProviderPipelineRun,
  ProviderRepository,
  WebhookPayloadResult,
} from '../interfaces/ci-provider.interface';

@Injectable()
export class GitLabCiProvider extends CiProviderBase {
  override readonly providerName = 'gitlab';
  private readonly logger = new Logger(GitLabCiProvider.name);

  constructor(_configService: ConfigService) {
    super();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildClient(config: CiConnectionConfig): AxiosInstance {
    const baseURL = config.serverUrl ?? 'https://gitlab.com';
    return axios.create({
      baseURL: `${baseURL}/api/v4`,
      headers: {
        'PRIVATE-TOKEN': config.authToken,
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });
  }

  /**
   * GitLab uses the project ID or URL-encoded path as the identifier.
   * config.repo holds this value.
   */
  private projectPath(config: CiConnectionConfig): string {
    return encodeURIComponent(config.repo);
  }

  // ─── Repository Discovery ────────────────────────────────────────────────

  override async listRepositories(
    authToken: string,
    serverUrl?: string,
  ): Promise<ProviderRepository[]> {
    const baseURL = serverUrl ?? 'https://gitlab.com';
    const client = axios.create({
      baseURL: `${baseURL}/api/v4`,
      headers: { 'PRIVATE-TOKEN': authToken, 'Content-Type': 'application/json' },
      timeout: 30_000,
    });

    const repos: ProviderRepository[] = [];
    let page = 1;
    const perPage = 100;

    try {
      while (true) {
        const response = await client.get('/projects', {
          params: {
            membership: true,
            per_page: perPage,
            page,
            order_by: 'last_activity_at',
            sort: 'desc',
            simple: true,
          },
        });
        const projects = response.data as Array<Record<string, unknown>>;
        if (!projects || projects.length === 0) break;

        for (const p of projects) {
          repos.push({
            externalRepoId: String(p['id'] ?? ''),
            name: String(p['path'] ?? ''),
            fullName: String(p['path_with_namespace'] ?? ''),
            defaultBranch: String(p['default_branch'] ?? 'main'),
            language: null,
            isPrivate: (p['visibility'] as string) === 'private',
            url: String(p['web_url'] ?? ''),
          });
        }

        if (projects.length < perPage) break;
        page++;
        if (page > 5) break; // Safety cap at 500 repos
      }
    } catch (error) {
      this.logger.error(`Failed to list GitLab projects: ${(error as Error).message}`);
    }

    return repos;
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  override verifyWebhookSignature(
    _rawBody: string,
    signature: string,
    secret: string,
  ): boolean {
    // GitLab sends the secret token in the X-Gitlab-Token header.
    // Verification is a simple string comparison (timing-safe).
    try {
      const sigBuf = Buffer.from(signature, 'utf8');
      const secretBuf = Buffer.from(secret, 'utf8');
      if (sigBuf.length !== secretBuf.length) return false;

      // Manual constant-time comparison
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
    eventType: string,
    payload: Record<string, unknown>,
  ): WebhookPayloadResult | null {
    // GitLab pipeline events have object_kind = 'pipeline'
    const objectKind = payload['object_kind'] as string | undefined;

    if (objectKind === 'pipeline' || eventType === 'Pipeline Hook') {
      return this.parsePipelineEvent(payload);
    }

    if (objectKind === 'push' || eventType === 'Push Hook') {
      return this.parsePushEvent(payload);
    }

    return null;
  }

  private parsePipelineEvent(
    payload: Record<string, unknown>,
  ): WebhookPayloadResult | null {
    const objectAttributes = payload['object_attributes'] as Record<string, unknown> | undefined;
    if (!objectAttributes) return null;

    const project = payload['project'] as Record<string, unknown> | undefined;
    const commit = payload['commit'] as Record<string, unknown> | undefined;
    const commitAuthor = commit?.['author'] as Record<string, unknown> | undefined;

    const status = String(objectAttributes['status'] ?? '');
    let eventType: string;
    if (status === 'failed') {
      eventType = 'pipeline_failed';
    } else if (status === 'success') {
      eventType = 'pipeline_success';
    } else {
      eventType = `pipeline.${status}`;
    }

    const pathWithNamespace = String(project?.['path_with_namespace'] ?? '');
    const parts = pathWithNamespace.split('/');
    const owner = parts.length >= 2 ? parts.slice(0, -1).join('/') : '';
    const repoName = parts[parts.length - 1] ?? '';

    return {
      eventType,
      externalRunId: String(objectAttributes['id'] ?? ''),
      workflowName: (objectAttributes['source'] as string | null) ?? null,
      headBranch: String(objectAttributes['ref'] ?? ''),
      headSha: String(objectAttributes['sha'] ?? ''),
      conclusion: status,
      runUrl: project
        ? `${String(project['web_url'] ?? '')}/-/pipelines/${String(objectAttributes['id'] ?? '')}`
        : null,
      startedAt: objectAttributes['created_at']
        ? new Date(String(objectAttributes['created_at']))
        : null,
      completedAt: objectAttributes['finished_at']
        ? new Date(String(objectAttributes['finished_at']))
        : null,
      repository: {
        externalId: String(project?.['id'] ?? ''),
        fullName: pathWithNamespace,
        owner,
        repo: repoName,
        defaultBranch: String(project?.['default_branch'] ?? 'main'),
        language: null, // GitLab webhook does not include language
      },
      organization: owner
        ? { login: owner, externalId: '' }
        : undefined,
      commitAuthor: (commitAuthor?.['name'] as string | null) ?? null,
      commitMessage: (commit?.['message'] as string | null) ?? null,
      raw: payload,
    };
  }

  private parsePushEvent(
    payload: Record<string, unknown>,
  ): WebhookPayloadResult | null {
    const ref = payload['ref'] as string | undefined;
    if (!ref?.startsWith('refs/heads/')) return null;

    const project = payload['project'] as Record<string, unknown> | undefined;
    const commits = payload['commits'] as Array<Record<string, unknown>> | undefined;
    const headCommit = commits?.length ? commits[commits.length - 1] : undefined;
    const commitAuthor = headCommit?.['author'] as Record<string, unknown> | undefined;

    const pathWithNamespace = String(project?.['path_with_namespace'] ?? '');
    const parts = pathWithNamespace.split('/');
    const owner = parts.length >= 2 ? parts.slice(0, -1).join('/') : '';
    const repoName = parts[parts.length - 1] ?? '';

    return {
      eventType: 'push',
      externalRunId: String(payload['after'] ?? ''),
      workflowName: null,
      headBranch: ref.replace('refs/heads/', ''),
      headSha: String(payload['after'] ?? ''),
      conclusion: 'push',
      runUrl: (headCommit?.['url'] as string | null) ?? null,
      startedAt: null,
      completedAt: null,
      repository: {
        externalId: String(project?.['id'] ?? ''),
        fullName: pathWithNamespace,
        owner,
        repo: repoName,
        defaultBranch: String(project?.['default_branch'] ?? 'main'),
        language: null,
      },
      commitAuthor: (commitAuthor?.['name'] as string | null) ?? null,
      commitMessage: (headCommit?.['message'] as string | null) ?? null,
      raw: payload,
    };
  }

  // ─── CI Operations ────────────────────────────────────────────────────────

  override async fetchLogs(
    config: CiConnectionConfig,
    externalRunId: string,
  ): Promise<string | null> {
    const client = this.buildClient(config);
    const project = this.projectPath(config);

    try {
      // First, get the jobs for this pipeline
      const jobsRes = await client.get(
        `/projects/${project}/pipelines/${externalRunId}/jobs`,
      );
      const jobs = jobsRes.data as Array<Record<string, unknown>>;
      if (!jobs || jobs.length === 0) return null;

      // Fetch trace (log) for each failed job, or all jobs if none failed
      const failedJobs = jobs.filter((j) => j['status'] === 'failed');
      const targetJobs = failedJobs.length > 0 ? failedJobs : jobs;

      const logParts: string[] = [];
      for (const job of targetJobs) {
        const jobId = String(job['id'] ?? '');
        const jobName = String(job['name'] ?? 'unknown');
        try {
          const traceRes = await client.get(
            `/projects/${project}/jobs/${jobId}/trace`,
            { responseType: 'text' },
          );
          logParts.push(`=== ${jobName} (job ${jobId}) ===\n${String(traceRes.data)}`);
        } catch {
          this.logger.warn(`Failed to fetch trace for job ${jobId}`);
        }
      }

      return logParts.length > 0 ? logParts.join('\n\n') : null;
    } catch (error) {
      if (this.isNotFound(error)) return null;
      this.logger.error(
        `Failed to fetch logs for pipeline ${externalRunId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  // ─── Pipeline Discovery ─────────────────────────────────────────────────

  override async listRecentPipelineRuns(
    config: CiConnectionConfig,
    _repoFullName: string,
    limit: number,
  ): Promise<ProviderPipelineRun[]> {
    const client = this.buildClient(config);
    const projectId = encodeURIComponent(config.repo);
    try {
      const response = await client.get(`/projects/${projectId}/pipelines`, {
        params: { per_page: limit, order_by: 'updated_at', sort: 'desc' },
      });
      const pipelines = (response.data ?? []) as Record<string, unknown>[];
      return pipelines.map((p) => {
        const status = String(p['status'] ?? '');
        const createdAt = p['created_at'] ? String(p['created_at']) : null;
        const updatedAt = p['updated_at'] ? String(p['updated_at']) : null;
        const durationMs = createdAt && updatedAt
          ? new Date(updatedAt).getTime() - new Date(createdAt).getTime()
          : null;
        return {
          externalRunId: String(p['id'] ?? ''),
          workflowName: p['source'] ? String(p['source']) : null,
          status: this.mapGitLabStatus(status),
          branch: String(p['ref'] ?? ''),
          commitSha: String(p['sha'] ?? ''),
          startedAt: createdAt,
          completedAt: updatedAt,
          duration: durationMs !== null ? Math.round(durationMs / 1000) : null,
          url: p['web_url'] ? String(p['web_url']) : null,
          provider: 'gitlab',
        };
      });
    } catch (error) {
      this.logger.error(`Failed to list GitLab pipelines: ${(error as Error).message}`);
      return [];
    }
  }

  private mapGitLabStatus(status: string): ProviderPipelineRun['status'] {
    if (status === 'success') return 'success';
    if (status === 'failed') return 'failed';
    if (status === 'running' || status === 'pending' || status === 'created') return 'running';
    if (status === 'canceled' || status === 'skipped') return 'cancelled';
    return 'unknown';
  }

  // ─── SCM Operations ───────────────────────────────────────────────────────

  override async fetchFile(
    config: CiConnectionConfig,
    path: string,
    ref: string,
  ): Promise<string | null> {
    const client = this.buildClient(config);
    const project = this.projectPath(config);
    const encodedPath = encodeURIComponent(path);

    try {
      const response = await client.get(
        `/projects/${project}/repository/files/${encodedPath}/raw`,
        { params: { ref }, responseType: 'text' },
      );
      return String(response.data);
    } catch (error) {
      if (this.isNotFound(error)) return null;
      this.logger.error(`Failed to fetch file ${path}: ${(error as Error).message}`);
      return null;
    }
  }

  override async fetchFileTree(
    config: CiConnectionConfig,
    ref: string,
  ): Promise<string[]> {
    const client = this.buildClient(config);
    const project = this.projectPath(config);

    try {
      const allPaths: string[] = [];
      let page = 1;
      const perPage = 100;

      // GitLab paginates the tree endpoint
      while (true) {
        const response = await client.get(
          `/projects/${project}/repository/tree`,
          { params: { ref, recursive: true, per_page: perPage, page } },
        );
        const items = response.data as Array<Record<string, unknown>>;
        if (!items || items.length === 0) break;

        for (const item of items) {
          if (item['type'] === 'blob' && item['path']) {
            allPaths.push(String(item['path']));
          }
        }

        if (items.length < perPage) break;
        page++;
      }

      return allPaths;
    } catch (error) {
      if (this.isNotFound(error)) return [];
      this.logger.error(`Failed to fetch file tree: ${(error as Error).message}`);
      return [];
    }
  }

  override async createBranch(
    config: CiConnectionConfig,
    branchName: string,
    fromSha: string,
  ): Promise<boolean> {
    const client = this.buildClient(config);
    const project = this.projectPath(config);

    try {
      await client.post(`/projects/${project}/repository/branches`, {
        branch: branchName,
        ref: fromSha,
      });
      return true;
    } catch (error) {
      const message = (error as Error).message;
      // GitLab returns 400 if branch already exists
      if (message.includes('already exists') || message.includes('Branch already exists')) {
        this.logger.warn(`Branch ${branchName} already exists, continuing`);
        return true;
      }
      throw new Error(`Failed to create branch ${branchName}: ${message}`);
    }
  }

  override async pushFiles(
    config: CiConnectionConfig,
    branch: string,
    files: Array<{ path: string; content: string }>,
    commitMessage: string,
  ): Promise<string> {
    const client = this.buildClient(config);
    const project = this.projectPath(config);

    // GitLab Commits API: create/update/delete files in a single commit
    const actions = files.map((file) => ({
      action: 'update' as const,
      file_path: file.path,
      content: file.content,
    }));

    const response = await client.post(`/projects/${project}/repository/commits`, {
      branch,
      commit_message: commitMessage,
      actions,
    });

    const data = response.data as Record<string, unknown>;
    return String(data['id'] ?? '');
  }

  override async createPullRequest(
    config: CiConnectionConfig,
    opts: { title: string; body: string; head: string; base: string },
  ): Promise<CreatePrResult> {
    const client = this.buildClient(config);
    const project = this.projectPath(config);

    const response = await client.post(`/projects/${project}/merge_requests`, {
      title: opts.title,
      description: opts.body,
      source_branch: opts.head,
      target_branch: opts.base,
    });

    const data = response.data as Record<string, unknown>;
    return {
      number: Number(data['iid']),
      url: String(data['web_url']),
    };
  }

  override async createIssue(
    config: CiConnectionConfig,
    opts: { title: string; body: string; labels: string[] },
  ): Promise<CreateIssueResult> {
    const client = this.buildClient(config);
    const project = this.projectPath(config);

    const response = await client.post(`/projects/${project}/issues`, {
      title: opts.title,
      description: opts.body,
      labels: opts.labels.join(','),
    });

    const data = response.data as Record<string, unknown>;
    return {
      number: Number(data['iid']),
      url: String(data['web_url']),
    };
  }

  override async getDefaultBranch(config: CiConnectionConfig): Promise<string> {
    const client = this.buildClient(config);
    const project = this.projectPath(config);

    const response = await client.get(`/projects/${project}`);
    const data = response.data as Record<string, unknown>;
    return String(data['default_branch'] ?? 'main');
  }

  override async addPrComment(
    config: CiConnectionConfig,
    prNumber: number,
    body: string,
  ): Promise<void> {
    const client = this.buildClient(config);
    const project = this.projectPath(config);

    await client.post(
      `/projects/${project}/merge_requests/${String(prNumber)}/notes`,
      { body },
    );
  }

  override async closePr(
    config: CiConnectionConfig,
    prNumber: number,
    comment?: string,
  ): Promise<void> {
    const client = this.buildClient(config);
    const project = this.projectPath(config);

    if (comment) {
      await client.post(
        `/projects/${project}/merge_requests/${String(prNumber)}/notes`,
        { body: comment },
      );
    }

    await client.put(
      `/projects/${project}/merge_requests/${String(prNumber)}`,
      { state_event: 'close' },
    );
  }

  override async deleteBranch(
    config: CiConnectionConfig,
    branchName: string,
  ): Promise<void> {
    const client = this.buildClient(config);
    const project = this.projectPath(config);

    try {
      await client.delete(
        `/projects/${project}/repository/branches/${encodeURIComponent(branchName)}`,
      );
    } catch (error) {
      if (this.isNotFound(error)) return; // Already deleted
      throw new Error(`Failed to delete branch ${branchName}: ${(error as Error).message}`);
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private isNotFound(error: unknown): boolean {
    const status = (error as { response?: { status?: number } }).response?.status;
    return status === 404;
  }
}
