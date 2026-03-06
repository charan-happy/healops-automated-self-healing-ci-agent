import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { PlatformRepository } from '@db/repositories/healops/platform.repository';
import { CiProviderConfigsRepository } from '@db/repositories/healops/ci-provider-configs.repository';
import { ScmProviderConfigsRepository } from '@db/repositories/healops/scm-provider-configs.repository';
import { GithubService } from '../github/github.service';
import { CiProviderFactory } from '../ci-provider/ci-provider.factory';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly platformRepository: PlatformRepository,
    private readonly ciProviderConfigsRepository: CiProviderConfigsRepository,
    private readonly scmProviderConfigsRepository: ScmProviderConfigsRepository,
    private readonly githubService: GithubService,
    private readonly ciProviderFactory: CiProviderFactory,
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
        await this.syncBranchesFromGitLab(repo, organizationId);
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

    // Sync commits from provider if none exist in DB yet
    let commitRows = await this.platformRepository.findCommitsByBranch(
      branchId,
      limit,
      offset,
    );

    if (commitRows.length === 0 && offset === 0) {
      await this.syncCommitsFromProvider(repo, branch, organizationId, limit);
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

  async addRepositories(
    organizationId: string,
    providerConfigId: string,
    providerType: 'ci' | 'scm',
    repos: Array<{ externalRepoId: string; name: string; defaultBranch?: string }>,
  ) {
    // Resolve the provider type string from the config
    let providerName: string;
    if (providerType === 'ci') {
      const config = await this.ciProviderConfigsRepository.findConfigById(providerConfigId);
      if (!config || config.organizationId !== organizationId) {
        throw new BadRequestException('CI provider config not found');
      }
      providerName = config.providerType;
    } else {
      const config = await this.scmProviderConfigsRepository.findConfigById(providerConfigId);
      if (!config || config.organizationId !== organizationId) {
        throw new BadRequestException('SCM provider config not found');
      }
      providerName = config.providerType;
    }

    const created = await Promise.all(
      repos.map(async (repo) => {
        // Idempotent: check if repo already exists
        const existing = await this.platformRepository.findRepositoryByProviderAndExternalId(
          providerName,
          repo.externalRepoId,
        );
        if (existing) return existing;

        return this.platformRepository.createRepository({
          organizationId,
          provider: providerName,
          externalRepoId: repo.externalRepoId,
          name: repo.name,
          defaultBranch: repo.defaultBranch ?? 'main',
          ciProviderConfigId: providerType === 'ci' ? providerConfigId : undefined,
        });
      }),
    );

    this.logger.log(`Added ${created.length} repositories for org ${organizationId} via ${providerName}`);

    return created.map((r) => ({
      id: r.id,
      name: r.name,
      provider: r.provider,
      defaultBranch: r.defaultBranch,
    }));
  }

  /**
   * Fetches pipeline runs from ALL active CI providers for a repository.
   *
   * A GitLab-hosted repo might have BOTH GitLab CI pipelines AND Jenkins builds.
   * A GitHub repo might have GitHub Actions AND Jenkins. We query every provider
   * that has an active config for the org, merge the results, and sort by time.
   */
  async listPipelineRuns(
    repositoryId: string,
    organizationId: string,
    limit: number,
  ) {
    const repo = await this.platformRepository.findRepositoryById(repositoryId);
    if (!repo || repo.organizationId !== organizationId) {
      throw new NotFoundException('Repository not found');
    }

    const repoProvider = repo.provider ?? 'github';
    const parts = repo.name.split('/');
    type PipelineRun = import('../ci-provider/interfaces/ci-provider.interface').ProviderPipelineRun;
    const queries: Array<Promise<PipelineRun[]>> = [];
    const coveredConfigIds = new Set<string>();

    // ─── 1) Explicit CI links (repository_ci_links table) ──────────────
    const ciLinks = await this.platformRepository.findCiLinksByRepository(repositoryId);
    this.logger.debug(`Pipeline fetch for ${repo.name}: ${ciLinks.length} explicit CI links found`);

    for (const link of ciLinks) {
      if (!link.isActive) continue;
      const config = await this.ciProviderConfigsRepository.findConfigById(link.ciProviderConfigId);
      if (!config?.isActive) continue;

      coveredConfigIds.add(config.id);
      const configData = (config.config as Record<string, string>) ?? {};
      const authToken = configData['accessToken'] ?? configData['authToken'] ?? '';
      if (!authToken) {
        this.logger.warn(`CI link ${link.id}: no auth token found for provider ${config.providerType}`);
        continue;
      }

      // Use custom pipelineName from the link, or derive from repo
      const pipelineName = link.pipelineName
        ?? this.deriveRepoIdentifier(config.providerType, repo.externalRepoId, parts);

      this.logger.debug(`CI link: querying ${config.providerType} with repo="${pipelineName}"`);
      queries.push(
        this.fetchPipelinesFromProvider(config.providerType, {
          owner: parts[0] ?? '',
          repo: pipelineName,
          authToken,
          serverUrl: configData['serverUrl'],
        }, repo.name, limit),
      );
    }

    // ─── 2) SCM-native CI (GitLab CI for GitLab repos, GitHub Actions) ─
    const scmConfigs = await this.scmProviderConfigsRepository.findConfigsByOrganization(organizationId);
    const scmConfig = scmConfigs.find((c) => c.isActive && c.providerType === repoProvider);
    if (scmConfig && !coveredConfigIds.has(scmConfig.id)) {
      const configData = (scmConfig.config as Record<string, string>) ?? {};
      const authToken = configData['accessToken'] ?? '';
      if (authToken) {
        const repoIdentifier = this.deriveRepoIdentifier(repoProvider, repo.externalRepoId, parts);
        this.logger.debug(`SCM-native CI: querying ${repoProvider} with repo="${repoIdentifier}"`);
        queries.push(
          this.fetchPipelinesFromProvider(repoProvider, {
            owner: parts[0] ?? '',
            repo: repoIdentifier,
            authToken,
            serverUrl: configData['serverUrl'],
          }, repo.name, limit),
        );
      } else {
        this.logger.warn(`SCM config for ${repoProvider}: no access token`);
      }
    }

    // ─── 3) Org-level CI configs NOT already covered by explicit links ─
    if (ciLinks.length === 0) {
      // No explicit links — fall back to querying ALL org-level CI configs
      const ciConfigs = await this.ciProviderConfigsRepository.findConfigsByOrganization(organizationId);
      this.logger.debug(`No explicit CI links — falling back to ${ciConfigs.length} org-level CI configs`);
      for (const ciConfig of ciConfigs) {
        if (!ciConfig.isActive) continue;
        if (ciConfig.providerType === repoProvider && scmConfig) continue;

        const configData = (ciConfig.config as Record<string, string>) ?? {};
        const authToken = configData['accessToken'] ?? configData['authToken'] ?? '';
        if (!authToken) continue;

        const repoIdentifier = this.deriveRepoIdentifier(ciConfig.providerType, repo.externalRepoId, parts);
        this.logger.debug(`Org CI fallback: querying ${ciConfig.providerType} with repo="${repoIdentifier}"`);
        queries.push(
          this.fetchPipelinesFromProvider(ciConfig.providerType, {
            owner: parts[0] ?? '',
            repo: repoIdentifier,
            authToken,
            serverUrl: configData['serverUrl'],
          }, repo.name, limit),
        );
      }
    }

    if (queries.length === 0) {
      this.logger.debug(`Pipeline fetch for ${repo.name}: no queries to run`);
      return [];
    }

    this.logger.debug(`Pipeline fetch for ${repo.name}: running ${queries.length} queries`);
    const results = await Promise.allSettled(queries);
    const allRuns: PipelineRun[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        allRuns.push(...result.value);
      } else {
        this.logger.warn(`Pipeline query failed: ${result.reason}`);
      }
    }
    this.logger.debug(`Pipeline fetch for ${repo.name}: ${allRuns.length} total runs found`);

    allRuns.sort((a, b) => {
      const timeA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
      const timeB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
      return timeB - timeA;
    });

    return allRuns.slice(0, limit);
  }

  /** Derive the provider-specific repo/job identifier from the repo data. */
  private deriveRepoIdentifier(providerType: string, externalRepoId: string, nameParts: string[]): string {
    if (providerType === 'gitlab') return externalRepoId;
    if (providerType === 'github') return nameParts[1] ?? nameParts[0] ?? '';
    // Jenkins and others: use short repo name
    return nameParts[1] ?? nameParts[0] ?? '';
  }

  private async fetchPipelinesFromProvider(
    providerType: string,
    config: { owner: string; repo: string; authToken: string; serverUrl?: string | undefined },
    repoFullName: string,
    limit: number,
  ): Promise<import('../ci-provider/interfaces/ci-provider.interface').ProviderPipelineRun[]> {
    try {
      const provider = this.ciProviderFactory.getProvider(providerType);
      return await provider.listRecentPipelineRuns(config, repoFullName, limit);
    } catch (err) {
      this.logger.warn(`Failed to fetch ${providerType} pipelines for ${repoFullName}: ${(err as Error).message}`);
      return [];
    }
  }

  // ─── CI Provider Job Discovery ──────────────────────────────────────────

  async listCiProviderJobs(ciProviderConfigId: string, organizationId: string) {
    const config = await this.ciProviderConfigsRepository.findConfigById(ciProviderConfigId);
    if (!config || config.organizationId !== organizationId) {
      throw new NotFoundException('CI provider config not found');
    }

    const configData = (config.config as Record<string, string>) ?? {};
    const authToken = configData['accessToken'] ?? configData['authToken'] ?? '';
    if (!authToken) {
      return [];
    }

    const provider = this.ciProviderFactory.getProvider(config.providerType);
    return provider.listJobs(authToken, configData['serverUrl']);
  }

  // ─── CI Link Management ──────────────────────────────────────────────────

  async listCiLinks(repositoryId: string, organizationId: string) {
    const repo = await this.platformRepository.findRepositoryById(repositoryId);
    if (!repo || repo.organizationId !== organizationId) {
      throw new NotFoundException('Repository not found');
    }

    const links = await this.platformRepository.findCiLinksByRepository(repositoryId);
    // Enrich with provider details
    const enriched = await Promise.all(
      links.map(async (link) => {
        const config = await this.ciProviderConfigsRepository.findConfigById(link.ciProviderConfigId);
        return {
          id: link.id,
          ciProviderConfigId: link.ciProviderConfigId,
          providerType: config?.providerType ?? 'unknown',
          displayName: config?.displayName ?? config?.providerType ?? 'Unknown',
          pipelineName: link.pipelineName,
          isActive: link.isActive,
          createdAt: link.createdAt.toISOString(),
        };
      }),
    );
    return enriched;
  }

  async addCiLink(
    repositoryId: string,
    organizationId: string,
    ciProviderConfigId: string,
    pipelineName?: string,
  ) {
    const repo = await this.platformRepository.findRepositoryById(repositoryId);
    if (!repo || repo.organizationId !== organizationId) {
      throw new NotFoundException('Repository not found');
    }

    // Verify the CI config belongs to the same org
    const config = await this.ciProviderConfigsRepository.findConfigById(ciProviderConfigId);
    if (!config || config.organizationId !== organizationId) {
      throw new BadRequestException('CI provider config not found');
    }

    const link = await this.platformRepository.createCiLink({
      repositoryId,
      ciProviderConfigId,
      pipelineName,
    });

    if (!link) {
      throw new BadRequestException('CI provider already linked to this repository');
    }

    this.logger.log(`Linked CI provider ${config.providerType} to repo ${repo.name}`);
    return {
      id: link.id,
      ciProviderConfigId: link.ciProviderConfigId,
      providerType: config.providerType,
      displayName: config.displayName ?? config.providerType,
      pipelineName: link.pipelineName,
      isActive: link.isActive,
      createdAt: link.createdAt.toISOString(),
    };
  }

  async updateCiLink(
    repositoryId: string,
    organizationId: string,
    linkId: string,
    data: { pipelineName?: string; isActive?: boolean },
  ) {
    const repo = await this.platformRepository.findRepositoryById(repositoryId);
    if (!repo || repo.organizationId !== organizationId) {
      throw new NotFoundException('Repository not found');
    }

    const updated = await this.platformRepository.updateCiLink(linkId, data);
    if (!updated) throw new NotFoundException('CI link not found');
    return updated;
  }

  async removeCiLink(repositoryId: string, organizationId: string, linkId: string) {
    const repo = await this.platformRepository.findRepositoryById(repositoryId);
    if (!repo || repo.organizationId !== organizationId) {
      throw new NotFoundException('Repository not found');
    }

    const removed = await this.platformRepository.removeCiLink(linkId);
    if (!removed) throw new NotFoundException('CI link not found');
    return { removed: true };
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

      const upsertedBranches: Array<{ id: string; name: string }> = [];
      for (const remoteBranch of remoteBranches) {
        const branch = await this.platformRepository.upsertBranch({
          repositoryId: repo.id,
          name: remoteBranch.name,
          isDefault: remoteBranch.name === (repo.defaultBranch ?? 'main'),
          isProtected: remoteBranch.isProtected,
          isHealopsBranch:
            remoteBranch.name.startsWith('healops/fix/') ||
            remoteBranch.name.startsWith('agent-fix/'),
        });
        if (branch) upsertedBranches.push(branch);
      }

      // Sync recent commits for each branch (parallel, max 5 at a time)
      const commitSyncPromises = upsertedBranches.map((branch) =>
        this.syncCommitsFromGitHub(repo, branch, 10).catch((err) => {
          this.logger.warn(`Failed to sync commits for branch ${branch.name}: ${(err as Error).message}`);
        }),
      );
      await Promise.allSettled(commitSyncPromises);

      this.logger.log(
        `Synced ${remoteBranches.length} branches (with commits) for ${repo.name}`,
      );
    } catch (error) {
      this.logger.warn(
        `Failed to sync branches from GitHub for ${repo.name}: ${(error as Error).message}`,
      );
    }
  }

  private async syncBranchesFromGitLab(
    repo: { id: string; name: string; externalRepoId: string; defaultBranch: string | null },
    organizationId: string,
  ) {
    try {
      // Find the GitLab SCM or CI provider config to get the access token
      const scmConfigs = await this.scmProviderConfigsRepository.findConfigsByOrganization(organizationId);
      const gitlabConfig = scmConfigs.find((c) => c.isActive && c.providerType === 'gitlab');
      if (!gitlabConfig) return;

      const configData = (gitlabConfig.config as Record<string, string>) ?? {};
      const accessToken = configData['accessToken'] ?? '';
      const serverUrl = configData['serverUrl'] ?? 'https://gitlab.com';
      if (!accessToken) return;

      const apiBase = serverUrl.replace(/\/+$/, '');
      const projectId = encodeURIComponent(repo.externalRepoId);

      const response = await axios.get(
        `${apiBase}/api/v4/projects/${projectId}/repository/branches`,
        {
          headers: { 'PRIVATE-TOKEN': accessToken },
          params: { per_page: 100 },
          timeout: 15_000,
        },
      );

      const branches = (response.data ?? []) as Array<{
        name: string;
        protected: boolean;
        commit?: { author_name?: string; committed_date?: string };
      }>;

      const upsertedBranches: Array<{ id: string; name: string }> = [];
      for (const branch of branches) {
        const upserted = await this.platformRepository.upsertBranch({
          repositoryId: repo.id,
          name: branch.name,
          isDefault: branch.name === (repo.defaultBranch ?? 'main'),
          isProtected: branch.protected ?? false,
          isHealopsBranch:
            branch.name.startsWith('healops/fix/') ||
            branch.name.startsWith('agent-fix/'),
        });
        if (upserted) upsertedBranches.push(upserted);
      }

      // Sync recent commits for each branch in parallel
      const commitSyncPromises = upsertedBranches.map((branch) =>
        this.syncCommitsFromGitLab(repo, branch, organizationId, 10).catch((err) => {
          this.logger.warn(`Failed to sync commits for branch ${branch.name}: ${(err as Error).message}`);
        }),
      );
      await Promise.allSettled(commitSyncPromises);

      this.logger.log(`Synced ${branches.length} GitLab branches (with commits) for ${repo.name}`);
    } catch (error) {
      this.logger.warn(
        `Failed to sync branches from GitLab for ${repo.name}: ${(error as Error).message}`,
      );
    }
  }

  private async syncCommitsFromProvider(
    repo: { id: string; name: string; externalRepoId: string; provider: string | null; githubInstallationId: string | null },
    branch: { id: string; name: string },
    organizationId: string,
    limit: number,
  ) {
    const providerName = repo.provider ?? 'github';

    try {
      if (providerName === 'gitlab') {
        await this.syncCommitsFromGitLab(repo, branch, organizationId, limit);
      } else if (providerName === 'github' && repo.githubInstallationId) {
        await this.syncCommitsFromGitHub(repo, branch, limit);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to sync commits for ${repo.name}/${branch.name}: ${(error as Error).message}`,
      );
    }
  }

  private async syncCommitsFromGitLab(
    repo: { id: string; name: string; externalRepoId: string },
    branch: { id: string; name: string },
    organizationId: string,
    limit: number,
  ) {
    const scmConfigs = await this.scmProviderConfigsRepository.findConfigsByOrganization(organizationId);
    const gitlabConfig = scmConfigs.find((c) => c.isActive && c.providerType === 'gitlab');
    if (!gitlabConfig) return;

    const configData = (gitlabConfig.config as Record<string, string>) ?? {};
    const accessToken = configData['accessToken'] ?? '';
    const serverUrl = configData['serverUrl'] ?? 'https://gitlab.com';
    if (!accessToken) return;

    const apiBase = serverUrl.replace(/\/+$/, '');
    const projectId = encodeURIComponent(repo.externalRepoId);

    const response = await axios.get(
      `${apiBase}/api/v4/projects/${projectId}/repository/commits`,
      {
        headers: { 'PRIVATE-TOKEN': accessToken },
        params: { ref_name: branch.name, per_page: limit },
        timeout: 15_000,
      },
    );

    const gitlabCommits = (response.data ?? []) as Array<{
      id: string;
      short_id: string;
      message: string;
      author_name: string;
      committed_date: string;
    }>;

    for (const gc of gitlabCommits) {
      await this.platformRepository.createCommit({
        repositoryId: repo.id,
        branchId: branch.id,
        commitSha: gc.id,
        author: gc.author_name,
        message: gc.message,
        committedAt: new Date(gc.committed_date),
        source: 'developer',
      });
    }

    this.logger.log(`Synced ${gitlabCommits.length} commits for ${repo.name}/${branch.name}`);
  }

  private async syncCommitsFromGitHub(
    repo: { id: string; name: string; githubInstallationId: string | null },
    branch: { id: string; name: string },
    limit: number,
  ) {
    if (!repo.githubInstallationId) return;

    const parts = repo.name.split('/');
    const owner = parts[0] ?? '';
    const repoName = parts[1] ?? repo.name;

    try {
      const octokit = await this.githubService.getAppProvider().getInstallationClient(repo.githubInstallationId);
      const { data } = await octokit.repos.listCommits({
        owner,
        repo: repoName,
        sha: branch.name,
        per_page: limit,
      });

      for (const gc of data) {
        await this.platformRepository.createCommit({
          repositoryId: repo.id,
          branchId: branch.id,
          commitSha: gc.sha,
          author: gc.commit?.author?.name ?? 'unknown',
          message: gc.commit?.message ?? '',
          committedAt: gc.commit?.author?.date ? new Date(gc.commit.author.date) : new Date(),
          source: 'developer',
        });
      }

      this.logger.log(`Synced ${data.length} GitHub commits for ${repo.name}/${branch.name}`);
    } catch (error) {
      this.logger.warn(`Failed to sync GitHub commits for ${repo.name}/${branch.name}: ${(error as Error).message}`);
    }
  }
}
