// ─── GitHub CI Provider ─────────────────────────────────────────────────────
// Full CI + SCM provider for GitHub, using the GitHub REST API via axios.
// Auth: Installation access token (pre-resolved in CiConnectionConfig.authToken).
// Webhook verification: HMAC-SHA256 (X-Hub-Signature-256).

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import AdmZip from 'adm-zip';
import { CiProviderBase } from './ci-provider.base';
import {
  CiConnectionConfig,
  CreateIssueResult,
  CreatePrResult,
  ProviderJob,
  ProviderPipelineRun,
  ProviderRepository,
  WebhookPayloadResult,
} from '../interfaces/ci-provider.interface';

@Injectable()
export class GitHubCiProvider extends CiProviderBase {
  override readonly providerName = 'github';
  private readonly logger = new Logger(GitHubCiProvider.name);

  constructor(_configService: ConfigService) {
    super();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private buildClient(config: CiConnectionConfig): AxiosInstance {
    const baseURL = config.serverUrl ?? 'https://api.github.com';
    return axios.create({
      baseURL,
      headers: {
        Authorization: `token ${config.authToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      timeout: 10_000,
    });
  }

  // ─── Repository Discovery ────────────────────────────────────────────────

  override async listRepositories(
    authToken: string,
    serverUrl?: string,
  ): Promise<ProviderRepository[]> {
    const baseURL = serverUrl ?? 'https://api.github.com';
    const client = axios.create({
      baseURL,
      headers: {
        Authorization: `token ${authToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      timeout: 10_000,
    });

    const repos: ProviderRepository[] = [];
    let page = 1;
    const perPage = 100;

    try {
      while (true) {
        const response = await client.get('/installation/repositories', {
          params: { per_page: perPage, page },
        });
        const data = response.data as { repositories?: Array<Record<string, unknown>> };
        const repositories = data.repositories ?? [];
        if (repositories.length === 0) break;

        for (const r of repositories) {
          repos.push({
            externalRepoId: String(r['id'] ?? ''),
            name: String(r['name'] ?? ''),
            fullName: String(r['full_name'] ?? ''),
            defaultBranch: String(r['default_branch'] ?? 'main'),
            language: (r['language'] as string | null) ?? null,
            isPrivate: Boolean(r['private']),
            url: String(r['html_url'] ?? ''),
          });
        }

        if (repositories.length < perPage) break;
        page++;
        if (page > 5) break; // Safety cap at 500 repos
      }
    } catch (error) {
      this.logger.error(`Failed to list GitHub repos: ${(error as Error).message}`);
    }

    return repos;
  }

  // ─── Job Discovery ──────────────────────────────────────────────────────

  override async listJobs(
    authToken: string,
    serverUrl?: string,
  ): Promise<ProviderJob[]> {
    const repos = await this.listRepositories(authToken, serverUrl);
    return repos.map((r) => ({
      id: r.fullName,
      name: r.fullName,
      url: r.url,
    }));
  }

  // ─── Webhook ──────────────────────────────────────────────────────────────

  override verifyWebhookSignature(
    rawBody: string,
    signature: string,
    secret: string,
  ): boolean {
    const computed = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
    try {
      const computedBuf = Buffer.from(computed, 'utf8');
      const receivedBuf = Buffer.from(signature, 'utf8');
      if (computedBuf.length !== receivedBuf.length) return false;
      return timingSafeEqual(computedBuf, receivedBuf);
    } catch {
      return false;
    }
  }

  override parseWebhookPayload(
    eventType: string,
    payload: Record<string, unknown>,
  ): WebhookPayloadResult | null {
    // Handle push events
    if (eventType === 'push') {
      return this.parsePushEvent(payload);
    }

    // Handle workflow_run events (primary CI event for GitHub Actions)
    if (eventType === 'workflow_run') {
      return this.parseWorkflowRunEvent(payload);
    }

    // Handle check_run events (alternative CI integration)
    if (eventType === 'check_run') {
      return this.parseCheckRunEvent(payload);
    }

    return null;
  }

  private parsePushEvent(payload: Record<string, unknown>): WebhookPayloadResult | null {
    const ref = payload['ref'] as string | undefined;
    if (!ref?.startsWith('refs/heads/')) return null;

    const repo = payload['repository'] as Record<string, unknown> | undefined;
    const headCommit = payload['head_commit'] as Record<string, unknown> | undefined;
    const installation = payload['installation'] as Record<string, unknown> | undefined;
    const organization = payload['organization'] as Record<string, unknown> | undefined;
    const sender = payload['sender'] as Record<string, unknown> | undefined;

    const fullName = String(repo?.['full_name'] ?? '');
    const parts = fullName.split('/');
    const owner = parts[0] ?? '';
    const repoName = parts[1] ?? '';

    return {
      eventType: 'push',
      externalRunId: String(payload['after'] ?? ''),
      workflowName: null,
      headBranch: ref.replace('refs/heads/', ''),
      headSha: String(payload['after'] ?? ''),
      conclusion: 'push',
      runUrl: (headCommit?.['url'] as string | null) ?? null,
      startedAt: headCommit?.['timestamp']
        ? new Date(String(headCommit['timestamp']))
        : null,
      completedAt: null,
      repository: {
        externalId: String(repo?.['id'] ?? ''),
        fullName,
        owner,
        repo: repoName,
        defaultBranch: String(repo?.['default_branch'] ?? 'main'),
        language: (repo?.['language'] as string | null) ?? null,
      },
      installation: installation
        ? { id: String(installation['id'] ?? '') }
        : undefined,
      organization: organization
        ? {
            login: String(organization['login'] ?? ''),
            externalId: String(organization['id'] ?? ''),
          }
        : undefined,
      commitAuthor:
        (sender?.['login'] as string | undefined)
        ?? ((headCommit?.['author'] as Record<string, unknown> | undefined)?.['name'] as string | undefined)
        ?? null,
      commitMessage: (headCommit?.['message'] as string | null) ?? null,
      raw: payload,
    };
  }

  private parseWorkflowRunEvent(
    payload: Record<string, unknown>,
  ): WebhookPayloadResult | null {
    const action = payload['action'] as string | undefined;
    const workflowRun = payload['workflow_run'] as Record<string, unknown> | undefined;
    if (!workflowRun) return null;

    const repo = payload['repository'] as Record<string, unknown> | undefined;
    const installation = payload['installation'] as Record<string, unknown> | undefined;
    const organization = payload['organization'] as Record<string, unknown> | undefined;
    const headCommit = workflowRun['head_commit'] as Record<string, unknown> | undefined;
    const author = headCommit?.['author'] as Record<string, unknown> | undefined;

    const conclusion = String(workflowRun['conclusion'] ?? '');
    let eventType: string;
    if (action === 'completed' && conclusion === 'failure') {
      eventType = 'pipeline_failed';
    } else if (action === 'completed' && conclusion === 'success') {
      eventType = 'pipeline_success';
    } else {
      eventType = `workflow_run.${action ?? 'unknown'}`;
    }

    const fullName = String(repo?.['full_name'] ?? '');
    const parts = fullName.split('/');
    const owner = parts[0] ?? '';
    const repoName = parts[1] ?? '';

    return {
      eventType,
      externalRunId: String(workflowRun['id'] ?? ''),
      workflowName: (workflowRun['name'] as string | null) ?? null,
      headBranch: String(workflowRun['head_branch'] ?? ''),
      headSha: String(workflowRun['head_sha'] ?? ''),
      conclusion,
      runUrl: (workflowRun['html_url'] as string | null) ?? null,
      startedAt: workflowRun['run_started_at']
        ? new Date(String(workflowRun['run_started_at']))
        : null,
      completedAt: workflowRun['updated_at']
        ? new Date(String(workflowRun['updated_at']))
        : null,
      repository: {
        externalId: String(repo?.['id'] ?? ''),
        fullName,
        owner,
        repo: repoName,
        defaultBranch: String(repo?.['default_branch'] ?? 'main'),
        language: (repo?.['language'] as string | null) ?? null,
      },
      installation: installation
        ? { id: String(installation['id'] ?? '') }
        : undefined,
      organization: organization
        ? {
            login: String(organization['login'] ?? ''),
            externalId: String(organization['id'] ?? ''),
          }
        : undefined,
      commitAuthor: (author?.['name'] as string | null) ?? null,
      commitMessage: (headCommit?.['message'] as string | null) ?? null,
      raw: payload,
    };
  }

  private parseCheckRunEvent(
    payload: Record<string, unknown>,
  ): WebhookPayloadResult | null {
    const action = payload['action'] as string | undefined;
    const checkRun = payload['check_run'] as Record<string, unknown> | undefined;
    if (!checkRun || action !== 'completed') return null;

    const repo = payload['repository'] as Record<string, unknown> | undefined;
    const installation = payload['installation'] as Record<string, unknown> | undefined;
    const organization = payload['organization'] as Record<string, unknown> | undefined;

    const conclusion = String(checkRun['conclusion'] ?? '');
    const eventType = conclusion === 'failure' ? 'pipeline_failed' : 'pipeline_success';

    const fullName = String(repo?.['full_name'] ?? '');
    const parts = fullName.split('/');
    const owner = parts[0] ?? '';
    const repoName = parts[1] ?? '';

    const checkSuite = checkRun['check_suite'] as Record<string, unknown> | undefined;
    const headCommit = checkSuite?.['head_commit'] as Record<string, unknown> | undefined;
    const author = headCommit?.['author'] as Record<string, unknown> | undefined;

    return {
      eventType,
      externalRunId: String(checkRun['id'] ?? ''),
      workflowName: (checkRun['name'] as string | null) ?? null,
      headBranch: String(checkSuite?.['head_branch'] ?? ''),
      headSha: String(checkSuite?.['head_sha'] ?? checkRun['head_sha'] ?? ''),
      conclusion,
      runUrl: (checkRun['html_url'] as string | null) ?? null,
      startedAt: checkRun['started_at']
        ? new Date(String(checkRun['started_at']))
        : null,
      completedAt: checkRun['completed_at']
        ? new Date(String(checkRun['completed_at']))
        : null,
      repository: {
        externalId: String(repo?.['id'] ?? ''),
        fullName,
        owner,
        repo: repoName,
        defaultBranch: String(repo?.['default_branch'] ?? 'main'),
        language: (repo?.['language'] as string | null) ?? null,
      },
      installation: installation
        ? { id: String(installation['id'] ?? '') }
        : undefined,
      organization: organization
        ? {
            login: String(organization['login'] ?? ''),
            externalId: String(organization['id'] ?? ''),
          }
        : undefined,
      commitAuthor: (author?.['name'] as string | null) ?? null,
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
    try {
      const response = await client.get(
        `/repos/${config.owner}/${config.repo}/actions/runs/${externalRunId}/logs`,
        { responseType: 'arraybuffer', maxRedirects: 5 },
      );

      const buffer = Buffer.from(response.data as ArrayBuffer);
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();

      const SKIP_PATTERNS =
        /set.up.job|checkout|setup.node|setup.python|setup.go|cache|install.depend|npm.install|pnpm.install|yarn.install|post.run|complete.job/i;
      const BUILD_PATTERNS =
        /build|compile|type.?check|lint|test|jest|vitest|pytest|make|tsc|next|webpack|vite|turbo|nx/i;

      const buildEntries: Array<{ name: string; text: string }> = [];
      const otherEntries: Array<{ name: string; text: string }> = [];

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const name = entry.entryName;
        const text = entry.getData().toString('utf8');

        if (SKIP_PATTERNS.test(name)) {
          otherEntries.push({ name, text });
        } else if (BUILD_PATTERNS.test(name)) {
          buildEntries.push({ name, text });
        } else {
          otherEntries.push({ name, text });
        }
      }

      const selectedEntries = buildEntries.length > 0 ? buildEntries : otherEntries;
      if (selectedEntries.length === 0) return null;

      return selectedEntries.map((e) => `=== ${e.name} ===\n${e.text}`).join('\n\n');
    } catch (error) {
      if (this.isNotFound(error)) return null;
      this.logger.error(
        `Failed to fetch logs for run ${externalRunId}: ${(error as Error).message}`,
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
    try {
      const response = await client.get(
        `/repos/${config.owner}/${config.repo}/actions/runs`,
        { params: { per_page: limit } },
      );
      const runs = (response.data?.['workflow_runs'] ?? []) as Record<string, unknown>[];
      return runs.map((run) => {
        const conclusion = String(run['conclusion'] ?? '');
        const status = String(run['status'] ?? '');
        const startedAt = run['run_started_at'] ? String(run['run_started_at']) : null;
        const completedAt = run['updated_at'] ? String(run['updated_at']) : null;
        const durationMs = startedAt && completedAt
          ? new Date(completedAt).getTime() - new Date(startedAt).getTime()
          : null;
        return {
          externalRunId: String(run['id'] ?? ''),
          workflowName: run['name'] ? String(run['name']) : null,
          status: this.mapGitHubStatus(status, conclusion),
          branch: String(run['head_branch'] ?? ''),
          commitSha: String(run['head_sha'] ?? ''),
          startedAt,
          completedAt,
          duration: durationMs !== null ? Math.round(durationMs / 1000) : null,
          url: run['html_url'] ? String(run['html_url']) : null,
          provider: 'github',
        };
      });
    } catch (error) {
      this.logger.error(`Failed to list pipeline runs: ${(error as Error).message}`);
      return [];
    }
  }

  private mapGitHubStatus(status: string, conclusion: string): ProviderPipelineRun['status'] {
    if (status === 'in_progress' || status === 'queued') return 'running';
    if (conclusion === 'success') return 'success';
    if (conclusion === 'failure') return 'failed';
    if (conclusion === 'cancelled') return 'cancelled';
    return 'unknown';
  }

  // ─── SCM Operations ───────────────────────────────────────────────────────

  override async fetchFile(
    config: CiConnectionConfig,
    path: string,
    ref: string,
  ): Promise<string | null> {
    const client = this.buildClient(config);
    try {
      const response = await client.get(
        `/repos/${config.owner}/${config.repo}/contents/${path}`,
        { params: { ref } },
      );
      const data = response.data as Record<string, unknown>;
      const content = data['content'] as string | undefined;
      if (!content) return null;
      return Buffer.from(content, 'base64').toString('utf8');
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
    try {
      const response = await client.get(
        `/repos/${config.owner}/${config.repo}/git/trees/${ref}`,
        { params: { recursive: '1' } },
      );
      const data = response.data as Record<string, unknown>;
      const tree = data['tree'] as Array<Record<string, unknown>> | undefined;
      if (!tree) return [];
      return tree
        .filter((item) => item['type'] === 'blob' && item['path'])
        .map((item) => String(item['path']));
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
    try {
      await client.post(`/repos/${config.owner}/${config.repo}/git/refs`, {
        ref: `refs/heads/${branchName}`,
        sha: fromSha,
      });
      return true;
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('Reference already exists')) {
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
    const repoPath = `/repos/${config.owner}/${config.repo}`;

    // 1. Get the latest commit on the branch
    const refRes = await client.get(`${repoPath}/git/ref/heads/${branch}`);
    const refData = refRes.data as Record<string, unknown>;
    const refObject = refData['object'] as Record<string, unknown>;
    const latestCommitSha = String(refObject['sha']);

    // 2. Get the tree of the latest commit
    const commitRes = await client.get(`${repoPath}/git/commits/${latestCommitSha}`);
    const commitData = commitRes.data as Record<string, unknown>;
    const treeData = commitData['tree'] as Record<string, unknown>;
    const baseTreeSha = String(treeData['sha']);

    // 3. Create blobs for each file
    const treeItems = await Promise.all(
      files.map(async (file) => {
        const blobRes = await client.post(`${repoPath}/git/blobs`, {
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64',
        });
        const blobData = blobRes.data as Record<string, unknown>;
        return {
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: String(blobData['sha']),
        };
      }),
    );

    // 4. Create new tree
    const newTreeRes = await client.post(`${repoPath}/git/trees`, {
      base_tree: baseTreeSha,
      tree: treeItems,
    });
    const newTreeData = newTreeRes.data as Record<string, unknown>;
    const newTreeSha = String(newTreeData['sha']);

    // 5. Create commit
    const newCommitRes = await client.post(`${repoPath}/git/commits`, {
      message: commitMessage,
      tree: newTreeSha,
      parents: [latestCommitSha],
    });
    const newCommitData = newCommitRes.data as Record<string, unknown>;
    const newCommitSha = String(newCommitData['sha']);

    // 6. Update branch ref
    await client.patch(`${repoPath}/git/refs/heads/${branch}`, {
      sha: newCommitSha,
    });

    return newCommitSha;
  }

  override async createPullRequest(
    config: CiConnectionConfig,
    opts: { title: string; body: string; head: string; base: string },
  ): Promise<CreatePrResult> {
    const client = this.buildClient(config);
    const response = await client.post(
      `/repos/${config.owner}/${config.repo}/pulls`,
      {
        title: opts.title,
        body: opts.body,
        head: opts.head,
        base: opts.base,
        // SAFETY: HealOps never creates non-draft PRs. Human must promote.
        draft: true,
      },
    );
    const data = response.data as Record<string, unknown>;
    return {
      number: Number(data['number']),
      url: String(data['html_url']),
    };
  }

  override async createIssue(
    config: CiConnectionConfig,
    opts: { title: string; body: string; labels: string[] },
  ): Promise<CreateIssueResult> {
    const client = this.buildClient(config);
    const response = await client.post(
      `/repos/${config.owner}/${config.repo}/issues`,
      {
        title: opts.title,
        body: opts.body,
        labels: opts.labels,
      },
    );
    const data = response.data as Record<string, unknown>;
    return {
      number: Number(data['number']),
      url: String(data['html_url']),
    };
  }

  override async getDefaultBranch(config: CiConnectionConfig): Promise<string> {
    const client = this.buildClient(config);
    const response = await client.get(
      `/repos/${config.owner}/${config.repo}`,
    );
    const data = response.data as Record<string, unknown>;
    return String(data['default_branch'] ?? 'main');
  }

  override async addPrComment(
    config: CiConnectionConfig,
    prNumber: number,
    body: string,
  ): Promise<void> {
    const client = this.buildClient(config);
    await client.post(
      `/repos/${config.owner}/${config.repo}/issues/${String(prNumber)}/comments`,
      { body },
    );
  }

  override async closePr(
    config: CiConnectionConfig,
    prNumber: number,
    comment?: string,
  ): Promise<void> {
    const client = this.buildClient(config);
    const repoPath = `/repos/${config.owner}/${config.repo}`;

    if (comment) {
      await client.post(`${repoPath}/issues/${String(prNumber)}/comments`, {
        body: comment,
      });
    }

    await client.patch(`${repoPath}/pulls/${String(prNumber)}`, {
      state: 'closed',
    });
  }

  override async deleteBranch(
    config: CiConnectionConfig,
    branchName: string,
  ): Promise<void> {
    const client = this.buildClient(config);
    try {
      await client.delete(
        `/repos/${config.owner}/${config.repo}/git/refs/heads/${branchName}`,
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
