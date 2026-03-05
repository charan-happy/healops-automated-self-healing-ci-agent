import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { ScmProviderConfigsRepository } from '@db/repositories/healops/scm-provider-configs.repository';
import { GithubService } from '../github/github.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly platformRepository: PlatformRepository,
    private readonly scmProviderConfigsRepository: ScmProviderConfigsRepository,
    private readonly githubService: GithubService,
  ) {}

  async listRepositories(organizationId: string) {
    const repos =
      await this.platformRepository.findRepositoriesWithBranchCount(
        organizationId,
      );

    return repos.map((r) => {
      const parts = r.name.split('/');
      const displayName = parts.length >= 2 ? (parts[1] ?? r.name) : r.name;
      return {
        id: r.id,
        name: displayName,
        repo: r.name,
        provider: r.provider ?? 'github',
        branchCount: r.branchCount ?? 0,
        defaultBranch: r.defaultBranch ?? 'main',
        lastActivity: r.lastActivity ?? null,
      };
    });
  }

  async listBranches(
    repositoryId: string,
    organizationId: string,
    syncFromProvider: boolean,
  ) {
    const repo =
      await this.platformRepository.findRepositoryById(repositoryId);
    if (!repo || repo.organizationId !== organizationId) {
      throw new NotFoundException('Repository not found');
    }

    if (syncFromProvider) {
      if (repo.provider === 'github' && repo.githubInstallationId) {
        await this.syncBranchesFromGitHub(repo);
      } else if (repo.provider === 'gitlab') {
        await this.syncBranchesFromScmProvider(repo);
      }
    }

    const branchRows =
      await this.platformRepository.findBranchesByRepository(repositoryId);

    return branchRows.map((b) => ({
      id: b.id,
      name: b.name,
      isDefault: b.isDefault ?? false,
      author: b.lastCommitAuthor ?? '',
      commitCount: b.commitCount ?? 0,
      lastCommit: b.lastCommitAt ?? '',
      pipelineStatus: 'pending' as const,
    }));
  }

  async listCommits(
    repositoryId: string,
    branchId: string,
    organizationId: string,
    limit: number,
    offset: number,
  ) {
    const repo =
      await this.platformRepository.findRepositoryById(repositoryId);
    if (!repo || repo.organizationId !== organizationId) {
      throw new NotFoundException('Repository not found');
    }

    const branch =
      await this.platformRepository.findBranchById(branchId);
    if (!branch || branch.repositoryId !== repositoryId) {
      throw new NotFoundException('Branch not found');
    }

    let commitRows = await this.platformRepository.findCommitsByBranch(
      branchId,
      limit,
      offset,
    );

    // On-demand sync: fetch commits from SCM provider if DB is empty
    if (commitRows.length === 0 && offset === 0) {
      await this.syncCommitsFromScmProvider(repo, branch.name, branchId);
      commitRows = await this.platformRepository.findCommitsByBranch(
        branchId,
        limit,
        offset,
      );
    }

    return commitRows.map((c) => ({
      id: c.id,
      sha: c.commitSha.slice(0, 7),
      fullSha: c.commitSha,
      message: c.message ?? '',
      author: c.author,
      timestamp: c.committedAt
        ? new Date(c.committedAt).toISOString()
        : '',
      source: c.source ?? 'developer',
      pipelineStatus: 'pending' as const,
      agentFixCount: 0,
    }));
  }

  /**
   * Resolve the SCM provider config for a repository's organization + provider type.
   */
  private async resolveScmConfig(organizationId: string, provider: string) {
    const scmConfig =
      await this.scmProviderConfigsRepository.findActiveConfigByOrgAndType(
        organizationId,
        provider,
      );
    if (!scmConfig) return null;
    const configData = (scmConfig.config as Record<string, string>) ?? {};
    return {
      authToken: configData['accessToken'] ?? '',
      serverUrl: configData['serverUrl'],
      externalRepoId: null as string | null,
    };
  }

  /**
   * Sync branches from a non-GitHub SCM provider (GitLab, Bitbucket).
   */
  private async syncBranchesFromScmProvider(repo: {
    id: string;
    name: string;
    organizationId: string;
    provider: string;
    externalRepoId: string;
    defaultBranch: string | null;
  }) {
    const scm = await this.resolveScmConfig(repo.organizationId, repo.provider);
    if (!scm || !scm.authToken) return;

    try {
      const baseURL = scm.serverUrl ?? 'https://gitlab.com';

      // Use axios directly for the branches endpoint
      const axios = (await import('axios')).default;
      const client = axios.create({
        baseURL: `${baseURL}/api/v4`,
        headers: { 'PRIVATE-TOKEN': scm.authToken },
        timeout: 15_000,
      });

      const projectPath = encodeURIComponent(repo.name);
      const response = await client.get(
        `/projects/${projectPath}/repository/branches`,
        { params: { per_page: 100 } },
      );
      const remoteBranches = response.data as Array<Record<string, unknown>>;

      for (const rb of remoteBranches) {
        const branchName = String(rb['name'] ?? '');
        if (!branchName) continue;

        await this.platformRepository.upsertBranch({
          repositoryId: repo.id,
          name: branchName,
          isDefault: branchName === (repo.defaultBranch ?? 'main'),
          isProtected: (rb['protected'] as boolean) ?? false,
          isHealopsBranch:
            branchName.startsWith('healops/fix/') ||
            branchName.startsWith('agent-fix/'),
        });
      }

      this.logger.log(
        `Synced ${remoteBranches.length} branches from ${repo.provider} for ${repo.name}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to sync branches from ${repo.provider} for ${repo.name}: ${(error as Error).message}`,
      );
    }
  }

  /**
   * On-demand sync: fetch commits for a branch from the SCM provider and store them.
   */
  private async syncCommitsFromScmProvider(
    repo: {
      id: string;
      name: string;
      organizationId: string;
      provider: string;
      externalRepoId: string;
    },
    branchName: string,
    branchId: string,
  ) {
    const scm = await this.resolveScmConfig(repo.organizationId, repo.provider);
    if (!scm || !scm.authToken) {
      this.logger.warn(`No SCM config found for ${repo.provider} in org ${repo.organizationId}`);
      return;
    }

    try {
      if (repo.provider === 'gitlab') {
        await this.syncCommitsFromGitLab(repo, branchName, branchId, scm);
      }
      // GitHub commit sync can be added later when GithubService.listCommits is available
    } catch (error) {
      this.logger.warn(
        `Failed to sync commits from ${repo.provider} for ${repo.name}/${branchName}: ${(error as Error).message}`,
      );
    }
  }

  private async syncCommitsFromGitLab(
    repo: { id: string; name: string },
    branchName: string,
    branchId: string,
    scm: { authToken: string; serverUrl?: string | undefined },
  ) {
    const axios = (await import('axios')).default;
    const baseURL = scm.serverUrl ?? 'https://gitlab.com';
    const client = axios.create({
      baseURL: `${baseURL}/api/v4`,
      headers: { 'PRIVATE-TOKEN': scm.authToken },
      timeout: 15_000,
    });

    const projectPath = encodeURIComponent(repo.name);
    const response = await client.get(
      `/projects/${projectPath}/repository/commits`,
      { params: { ref_name: branchName, per_page: 30 } },
    );
    const remoteCommits = response.data as Array<Record<string, unknown>>;

    let synced = 0;
    for (const rc of remoteCommits) {
      const sha = String(rc['id'] ?? '');
      if (!sha) continue;

      await this.platformRepository.createCommit({
        repositoryId: repo.id,
        branchId,
        commitSha: sha,
        author: String(rc['author_name'] ?? rc['committer_name'] ?? 'unknown'),
        message: String(rc['title'] ?? rc['message'] ?? ''),
        source: 'developer',
        committedAt: rc['committed_date']
          ? new Date(String(rc['committed_date']))
          : new Date(),
      });
      synced++;
    }

    this.logger.log(
      `Synced ${synced} commits from GitLab for ${repo.name}/${branchName}`,
    );
  }

  private async syncBranchesFromGitHub(repo: {
    id: string;
    name: string;
    githubInstallationId: string | null;
    defaultBranch: string | null;
  }) {
    if (!repo.githubInstallationId) return;

    try {
      const parts = repo.name.split('/');
      const owner = parts[0] ?? '';
      const repoName = parts[1] ?? repo.name;

      const remoteBranches = await this.githubService.listBranches(
        repo.githubInstallationId,
        owner,
        repoName,
      );

      for (const remoteBranch of remoteBranches) {
        await this.platformRepository.upsertBranch({
          repositoryId: repo.id,
          name: remoteBranch.name,
          isDefault: remoteBranch.name === (repo.defaultBranch ?? 'main'),
          isProtected: remoteBranch.isProtected,
          isHealopsBranch:
            remoteBranch.name.startsWith('healops/fix/') ||
            remoteBranch.name.startsWith('agent-fix/'),
        });
      }

      this.logger.log(
        `Synced ${remoteBranches.length} branches for ${repo.name}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to sync branches from GitHub for ${repo.name}: ${(error as Error).message}`,
      );
    }
  }
}
