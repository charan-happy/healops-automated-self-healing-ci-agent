import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { GithubService } from '../github/github.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly platformRepository: PlatformRepository,
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

    if (
      syncFromProvider &&
      repo.provider === 'github' &&
      repo.githubInstallationId
    ) {
      await this.syncBranchesFromGitHub(repo);
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

    const commitRows = await this.platformRepository.findCommitsByBranch(
      branchId,
      limit,
      offset,
    );

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
