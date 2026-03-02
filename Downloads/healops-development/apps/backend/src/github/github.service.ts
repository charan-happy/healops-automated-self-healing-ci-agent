// ─── GitHub Service ─────────────────────────────────────────────────────────
// Core Octokit operations for GitHub API interactions.
// EC-47: Non-404 errors throw instead of returning null.

import { Injectable, Logger } from '@nestjs/common';
import { GithubAppProvider } from './providers/github-app.provider';
import AdmZip from 'adm-zip';

export interface CreatePrOptions {
  title: string;
  body: string;
  head: string;
  base: string;
}

export interface CreateIssueOptions {
  title: string;
  body: string;
  labels: string[];
}

@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(private readonly githubApp: GithubAppProvider) {}

  /**
   * Get file content from a repository.
   * Returns null for 404 (file not found).
   */
  async getFileContent(
    installationId: string,
    owner: string,
    repo: string,
    path: string,
    ref: string,
  ): Promise<string | null> {
    try {
      const octokit = await this.githubApp.getInstallationClient(installationId);
      const response = await octokit.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if ('content' in response.data && response.data.content) {
        return Buffer.from(response.data.content, 'base64').toString('utf8');
      }
      return null;
    } catch (error) {
      if (this.is404(error)) return null;
      this.logger.error(`Failed to get file ${path}: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Get the full file tree of a repository at a given SHA.
   * Returns empty array for 404.
   */
  async getRepoTree(
    installationId: string,
    owner: string,
    repo: string,
    sha: string,
  ): Promise<string[]> {
    try {
      const octokit = await this.githubApp.getInstallationClient(installationId);
      const { data } = await octokit.git.getTree({
        owner,
        repo,
        tree_sha: sha,
        recursive: 'true',
      });
      return data.tree
        .filter((item) => item.type === 'blob' && item.path)
        .map((item) => item.path as string);
    } catch (error) {
      if (this.is404(error)) return [];
      this.logger.error(`Failed to get repo tree: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * Create a new branch from a given ref.
   * EC-47: Throws on non-recoverable errors.
   */
  async createBranch(
    installationId: string,
    owner: string,
    repo: string,
    branchName: string,
    fromSha: string,
  ): Promise<boolean> {
    try {
      const octokit = await this.githubApp.getInstallationClient(installationId);
      await octokit.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha: fromSha,
      });
      return true;
    } catch (error) {
      const message = (error as Error).message;
      // Branch may already exist from a previous attempt
      if (message.includes('Reference already exists')) {
        this.logger.warn(`Branch ${branchName} already exists, continuing`);
        return true;
      }
      throw new Error(`Failed to create branch ${branchName}: ${message}`);
    }
  }

  /**
   * Push file changes to a branch via the Git Data API.
   * EC-47: Throws on failure.
   */
  async pushFiles(
    installationId: string,
    owner: string,
    repo: string,
    branch: string,
    files: Array<{ path: string; content: string }>,
    commitMessage: string,
  ): Promise<string> {
    const octokit = await this.githubApp.getInstallationClient(installationId);

    // Get the latest commit on the branch
    const { data: ref } = await octokit.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const latestCommitSha = ref.object.sha;

    // Get the tree of the latest commit
    const { data: commit } = await octokit.git.getCommit({
      owner,
      repo,
      commit_sha: latestCommitSha,
    });

    // Create blobs for each file
    const treeItems = await Promise.all(
      files.map(async (file) => {
        const { data: blob } = await octokit.git.createBlob({
          owner,
          repo,
          content: Buffer.from(file.content).toString('base64'),
          encoding: 'base64',
        });
        return {
          path: file.path,
          mode: '100644' as const,
          type: 'blob' as const,
          sha: blob.sha,
        };
      }),
    );

    // Create new tree
    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: commit.tree.sha,
      tree: treeItems,
    });

    // Create commit
    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTree.sha,
      parents: [latestCommitSha],
    });

    // Update branch ref
    await octokit.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });

    return newCommit.sha;
  }

  /**
   * Create a draft pull request.
   * SAFETY: HealOps never creates non-draft PRs. Human must promote.
   * EC-47: Throws on failure.
   */
  async createPR(
    installationId: string,
    owner: string,
    repo: string,
    opts: CreatePrOptions,
  ): Promise<{ number: number; url: string }> {
    const octokit = await this.githubApp.getInstallationClient(installationId);
    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title: opts.title,
      body: opts.body,
      head: opts.head,
      base: opts.base,
      // SAFETY: HealOps never creates non-draft PRs. Human must promote.
      draft: true,
    });
    return { number: pr.number, url: pr.html_url };
  }

  /**
   * Create a GitHub Issue for escalation.
   * EC-47: Throws on failure.
   */
  async createIssue(
    installationId: string,
    owner: string,
    repo: string,
    opts: CreateIssueOptions,
  ): Promise<{ number: number; url: string }> {
    const octokit = await this.githubApp.getInstallationClient(installationId);
    const { data: issue } = await octokit.issues.create({
      owner,
      repo,
      title: opts.title,
      body: opts.body,
      labels: opts.labels,
    });
    return { number: issue.number, url: issue.html_url };
  }

  /**
   * Get workflow run logs.
   * EC-47: Throws on non-404 errors.
   */
  async getWorkflowRunLogs(
    installationId: string,
    owner: string,
    repo: string,
    runId: number,
  ): Promise<string | null> {
    this.logger.log(`[LOG DOWNLOAD] Starting for run=${String(runId)} repo=${owner}/${repo}`);
    try {
      const octokit = await this.githubApp.getInstallationClient(installationId);
      const response = await octokit.actions.downloadWorkflowRunLogs({
        owner,
        repo,
        run_id: runId,
      });

      // GitHub returns logs as a zip file (ArrayBuffer/Buffer)
      this.logger.log(`[LOG DOWNLOAD] response.data type=${typeof response.data}, isBuffer=${String(Buffer.isBuffer(response.data))}, constructor=${(response.data as object)?.constructor?.name ?? 'unknown'}`);
      if (typeof response.data === 'string') {
        this.logger.log(`[LOG DOWNLOAD] Got string response (length=${String(response.data.length)}), first 200 chars: ${response.data.substring(0, 200)}`);
        return response.data;
      }

      // Extract text from zip entries
      // GitHub Actions zip has per-step files like "job/4_Build.txt", "job/5_Run tests.txt"
      // Prioritize build/test steps over install/setup steps
      const buffer = Buffer.isBuffer(response.data)
        ? response.data
        : Buffer.from(response.data as ArrayBuffer);
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();

      // DEBUG: Log all zip entry names so we can see the exact structure
      const entryNames = entries.filter((e: AdmZip.IZipEntry) => !e.isDirectory).map((e: AdmZip.IZipEntry) => e.entryName);
      this.logger.log(`[ZIP ENTRIES] ${JSON.stringify(entryNames)}`);

      const SKIP_PATTERNS = /set.up.job|checkout|setup.node|setup.python|setup.go|cache|install.depend|npm.install|pnpm.install|yarn.install|post.run|complete.job/i;
      const BUILD_PATTERNS = /build|compile|type.?check|lint|test|jest|vitest|pytest|make|tsc|next|webpack|vite|turbo|nx/i;

      const buildEntries: Array<{ name: string; text: string }> = [];
      const otherEntries: Array<{ name: string; text: string }> = [];

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const name = entry.entryName;
        const text = entry.getData().toString('utf8');

        const matched = SKIP_PATTERNS.test(name) ? 'SKIP' : BUILD_PATTERNS.test(name) ? 'BUILD' : 'OTHER';
        this.logger.log(`[ZIP CLASSIFY] ${matched}: ${name}`);

        if (SKIP_PATTERNS.test(name)) {
          otherEntries.push({ name, text });
        } else if (BUILD_PATTERNS.test(name)) {
          buildEntries.push({ name, text });
        } else {
          otherEntries.push({ name, text });
        }
      }

      this.logger.log(`[ZIP RESULT] buildEntries=${String(buildEntries.length)}, otherEntries=${String(otherEntries.length)}`);

      // If we have build-specific entries, return only those
      // Otherwise fall back to all non-skipped entries
      const selectedEntries = buildEntries.length > 0 ? buildEntries : otherEntries;
      if (selectedEntries.length === 0) return null;

      const logTexts = selectedEntries.map((e) => `=== ${e.name} ===\n${e.text}`);
      return logTexts.join('\n\n');
    } catch (error) {
      if (this.is404(error)) return null;
      throw new Error(`Failed to get workflow logs for run ${String(runId)}: ${(error as Error).message}`);
    }
  }

  /**
   * Get the status of the latest workflow run on a branch.
   * EC-47: Throws on non-404 errors.
   */
  async getLatestWorkflowStatus(
    installationId: string,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<string | null> {
    try {
      const octokit = await this.githubApp.getInstallationClient(installationId);
      const { data } = await octokit.actions.listWorkflowRunsForRepo({
        owner,
        repo,
        branch,
        per_page: 1,
      });

      const latestRun = data.workflow_runs[0];
      if (!latestRun) return null;
      return latestRun.conclusion ?? latestRun.status ?? null;
    } catch (error) {
      if (this.is404(error)) return null;
      throw new Error(`Failed to get workflow status for ${branch}: ${(error as Error).message}`);
    }
  }

  /**
   * Add a comment to a pull request.
   */
  async addPrComment(
    installationId: string,
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
  ): Promise<void> {
    const octokit = await this.githubApp.getInstallationClient(installationId);
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
  }

  /**
   * Close a pull request with an optional comment.
   */
  async closePr(
    installationId: string,
    owner: string,
    repo: string,
    prNumber: number,
    comment?: string,
  ): Promise<void> {
    const octokit = await this.githubApp.getInstallationClient(installationId);

    if (comment) {
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: comment,
      });
    }

    await octokit.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      state: 'closed',
    });
  }

  /**
   * Delete a branch.
   */
  async deleteBranch(
    installationId: string,
    owner: string,
    repo: string,
    branchName: string,
  ): Promise<void> {
    try {
      const octokit = await this.githubApp.getInstallationClient(installationId);
      await octokit.git.deleteRef({
        owner,
        repo,
        ref: `heads/${branchName}`,
      });
    } catch (error) {
      if (this.is404(error)) return; // Already deleted
      throw new Error(`Failed to delete branch ${branchName}: ${(error as Error).message}`);
    }
  }

  /**
   * Add labels to a PR/issue.
   */
  async addLabels(
    installationId: string,
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    try {
      const octokit = await this.githubApp.getInstallationClient(installationId);
      await octokit.issues.addLabels({
        owner,
        repo,
        issue_number: issueNumber,
        labels,
      });
    } catch (error) {
      this.logger.warn(`Failed to add labels: ${(error as Error).message}`);
    }
  }

  /**
   * Check if a branch exists.
   */
  async branchExists(
    installationId: string,
    owner: string,
    repo: string,
    branch: string,
  ): Promise<boolean> {
    try {
      const octokit = await this.githubApp.getInstallationClient(installationId);
      await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      return true;
    } catch (error) {
      if (this.is404(error)) return false;
      throw error;
    }
  }

  /**
   * Get repository default branch from GitHub API.
   */
  async getDefaultBranch(
    installationId: string,
    owner: string,
    repo: string,
  ): Promise<string> {
    const octokit = await this.githubApp.getInstallationClient(installationId);
    const { data } = await octokit.repos.get({ owner, repo });
    return data.default_branch;
  }

  /**
   * Expose the app provider for services that need direct Octokit access.
   */
  getAppProvider(): GithubAppProvider {
    return this.githubApp;
  }

  /** Check if an error is a 404 */
  private is404(error: unknown): boolean {
    return (error as { status?: number }).status === 404;
  }
}
