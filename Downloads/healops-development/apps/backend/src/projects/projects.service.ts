// ─── Projects Service ───────────────────────────────────────────────────────
// Business logic for listing repositories, branches, and commits.
// Supports optional branch sync from GitHub via the GithubService.

import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { GithubService } from '../github/github.service';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly platformRepository: PlatformRepository,
    private readonly githubService: GithubService,
  ) {}

  async listRepos(orgId: string) {
    const repos = await this.platformRepository.findRepositoriesWithBranchCount(orgId);

    return repos.map((r) => ({
      id: r.id,
      name: r.name,
      provider: r.provider,
      defaultBranch: r.defaultBranch,
      primaryLanguage: r.primaryLanguage,
      isActive: r.isActive,
      branchCount: r.branchCount,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listBranches(orgId: string, repositoryId: string, sync: boolean) {
    const repo = await this.platformRepository.findRepositoryById(repositoryId);
    if (!repo) {
      throw new NotFoundException('Repository not found');
    }
    if (repo.organizationId !== orgId) {
      throw new ForbiddenException('Repository does not belong to your organization');
    }

    // Optionally sync branches from GitHub before returning
    if (sync && repo.githubInstallationId && repo.provider === 'github') {
      await this.syncBranchesFromGitHub(repo);
    }

    const branchRows = await this.platformRepository.findBranchesByRepository(repositoryId);

    return branchRows.map((b) => ({
      id: b.id,
      name: b.name,
      isDefault: b.isDefault,
      isProtected: b.isProtected,
      isHealopsBranch: b.isHealopsBranch,
      createdAt: b.createdAt.toISOString(),
    }));
  }

  async listCommits(
    orgId: string,
    repositoryId: string,
    branchId: string,
    limit: number,
    offset: number,
  ) {
    const repo = await this.platformRepository.findRepositoryById(repositoryId);
    if (!repo) {
      throw new NotFoundException('Repository not found');
    }
    if (repo.organizationId !== orgId) {
      throw new ForbiddenException('Repository does not belong to your organization');
    }

    const branch = await this.platformRepository.findBranchById(branchId);
    if (!branch || branch.repositoryId !== repositoryId) {
      throw new NotFoundException('Branch not found in this repository');
    }

    const commitRows = await this.platformRepository.findCommitsByBranch(
      branchId,
      limit,
      offset,
    );

    return {
      data: commitRows.map((c) => ({
        id: c.id,
        commitSha: c.commitSha,
        author: c.author,
        message: c.message,
        source: c.source,
        committedAt: c.committedAt.toISOString(),
        createdAt: c.createdAt.toISOString(),
      })),
      limit,
      offset,
    };
  }

  /**
   * Sync branches from GitHub into the local database.
   * Inserts new branches and updates existing ones.
   */
  private async syncBranchesFromGitHub(repo: {
    id: string;
    name: string;
    defaultBranch: string;
    githubInstallationId: string | null;
  }) {
    if (!repo.githubInstallationId) return;

    try {
      const parts = repo.name.split('/');
      const owner = parts.length >= 2 ? (parts[0] ?? '') : '';
      const repoName = parts.length >= 2 ? (parts[1] ?? '') : repo.name;

      const remoteBranches = await this.githubService.listBranches(
        repo.githubInstallationId,
        owner,
        repoName,
      );

      for (const rb of remoteBranches) {
        await this.platformRepository.upsertBranch({
          repositoryId: repo.id,
          name: rb.name,
          isDefault: rb.name === repo.defaultBranch,
          isProtected: rb.isProtected,
        });
      }

      this.logger.log(
        `Synced ${String(remoteBranches.length)} branches for repo ${repo.name}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to sync branches for repo ${repo.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
