// ─── Platform Repository ────────────────────────────────────────────────────
// Data access for: organizations, repositories, repository_settings, branches, commits

import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import {
  organizations,
  repositories,
  repositorySettings,
  branches,
  commits,
} from '../../schema/platform';
import { eq, and, sql, desc } from 'drizzle-orm';
import { pipelineRuns } from '../../schema/ingestion';

@Injectable()
export class PlatformRepository {
  constructor(private readonly dbService: DBService) {}

  // ─── Organizations ──────────────────────────────────────────────────────

  async findOrganizationById(id: string) {
    const [row] = await this.dbService.db
      .select()
      .from(organizations)
      .where(eq(organizations.id, id));
    return row ?? null;
  }

  /**
   * Find or create an organization by name.
   * Handles concurrent webhook race conditions by catching unique violations
   * and falling back to a lookup.
   */
  async createOrganization(data: typeof organizations.$inferInsert) {
    // Check if org already exists by name
    const [existing] = await this.dbService.db
      .select()
      .from(organizations)
      .where(eq(organizations.name, data.name));
    if (existing) return existing;

    try {
      const [row] = await this.dbService.db
        .insert(organizations)
        .values(data)
        .returning();
      if (!row) throw new Error('Failed to create organization');
      return row;
    } catch {
      // Race condition: another request created it between our check and insert
      const [fallback] = await this.dbService.db
        .select()
        .from(organizations)
        .where(eq(organizations.name, data.name));
      if (!fallback) throw new Error('Failed to create or find organization');
      return fallback;
    }
  }

  // ─── Repositories ──────────────────────────────────────────────────────

  async findRepositoryById(id: string) {
    const [row] = await this.dbService.db
      .select()
      .from(repositories)
      .where(eq(repositories.id, id));
    return row ?? null;
  }

  async findRepositoryByProviderAndExternalId(provider: string, externalRepoId: string) {
    const [row] = await this.dbService.db
      .select()
      .from(repositories)
      .where(
        and(
          eq(repositories.provider, provider),
          eq(repositories.externalRepoId, externalRepoId),
        ),
      );
    return row ?? null;
  }

  async findRepositoriesByOrganization(organizationId: string) {
    return this.dbService.db
      .select()
      .from(repositories)
      .where(
        and(
          eq(repositories.organizationId, organizationId),
          eq(repositories.isActive, true),
        ),
      );
  }

  async createRepository(data: typeof repositories.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(repositories)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create repository');
    return row;
  }

  async updateRepositoryInstallationId(repositoryId: string, installationId: string) {
    const [row] = await this.dbService.db
      .update(repositories)
      .set({ githubInstallationId: installationId })
      .where(eq(repositories.id, repositoryId))
      .returning();
    return row ?? null;
  }

  // ─── Repository Settings ───────────────────────────────────────────────

  async findSettingsByRepositoryId(repositoryId: string) {
    const [row] = await this.dbService.db
      .select()
      .from(repositorySettings)
      .where(eq(repositorySettings.repositoryId, repositoryId));
    return row ?? null;
  }

  async upsertSettings(data: typeof repositorySettings.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(repositorySettings)
      .values(data)
      .onConflictDoUpdate({
        target: repositorySettings.repositoryId,
        set: {
          ...data,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    if (!row) throw new Error('Failed to upsert repository settings');
    return row;
  }

  // ─── Extended Queries ──────────────────────────────────────────────────

  async findOrganizationBySlug(slug: string) {
    const [row] = await this.dbService.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug));
    return row ?? null;
  }

  async updateOrganization(
    id: string,
    data: Partial<typeof organizations.$inferInsert>,
  ) {
    const [row] = await this.dbService.db
      .update(organizations)
      .set(data)
      .where(eq(organizations.id, id))
      .returning();
    return row ?? null;
  }

  async findRepositoriesWithBranchCount(organizationId: string) {
    return this.dbService.db
      .select({
        id: repositories.id,
        organizationId: repositories.organizationId,
        provider: repositories.provider,
        externalRepoId: repositories.externalRepoId,
        name: repositories.name,
        defaultBranch: repositories.defaultBranch,
        primaryLanguage: repositories.primaryLanguage,
        isActive: repositories.isActive,
        githubInstallationId: repositories.githubInstallationId,
        ciProviderConfigId: repositories.ciProviderConfigId,
        createdAt: repositories.createdAt,
        branchCount: sql<number>`count(${branches.id})::int`,
      })
      .from(repositories)
      .leftJoin(branches, eq(branches.repositoryId, repositories.id))
      .where(
        and(
          eq(repositories.organizationId, organizationId),
          eq(repositories.isActive, true),
        ),
      )
      .groupBy(repositories.id);
  }

  async findBranchesByRepository(repositoryId: string) {
    return this.dbService.db
      .select()
      .from(branches)
      .where(eq(branches.repositoryId, repositoryId))
      .orderBy(desc(branches.createdAt));
  }

  async findBranchById(branchId: string) {
    const [row] = await this.dbService.db
      .select()
      .from(branches)
      .where(eq(branches.id, branchId));
    return row ?? null;
  }

  async findCommitsByBranch(branchId: string, limit: number, offset: number) {
    return this.dbService.db
      .select()
      .from(commits)
      .where(eq(commits.branchId, branchId))
      .orderBy(desc(commits.committedAt))
      .limit(limit)
      .offset(offset);
  }

  async upsertBranch(data: typeof branches.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(branches)
      .values(data)
      .onConflictDoUpdate({
        target: [branches.repositoryId, branches.name],
        set: {
          isDefault: data.isDefault,
          isProtected: data.isProtected,
        },
      })
      .returning();
    if (!row) throw new Error('Failed to upsert branch');
    return row;
  }

  // ─── Branches ──────────────────────────────────────────────────────────

  async findBranchByRepoAndName(repositoryId: string, name: string) {
    const [row] = await this.dbService.db
      .select()
      .from(branches)
      .where(and(eq(branches.repositoryId, repositoryId), eq(branches.name, name)));
    return row ?? null;
  }

  async createBranch(data: typeof branches.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(branches)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  async findExpiredHealopsBranches() {
    return this.dbService.db
      .select()
      .from(branches)
      .where(
        and(
          eq(branches.isHealopsBranch, true),
          sql`${branches.autoDeleteAfter} IS NOT NULL AND ${branches.autoDeleteAfter} < now()`,
        ),
      );
  }

  /**
   * Clear autoDeleteAfter after a branch has been deleted from GitHub.
   * This prevents the cleanup cron from re-attempting deletion on each run.
   */
  async clearBranchAutoDelete(id: string) {
    const [row] = await this.dbService.db
      .update(branches)
      .set({ autoDeleteAfter: null })
      .where(eq(branches.id, id))
      .returning();
    return row ?? null;
  }

  // ─── Commits ───────────────────────────────────────────────────────────

  async findCommitByRepoAndSha(repositoryId: string, commitSha: string) {
    const [row] = await this.dbService.db
      .select()
      .from(commits)
      .where(
        and(eq(commits.repositoryId, repositoryId), eq(commits.commitSha, commitSha)),
      );
    return row ?? null;
  }

  async createCommit(data: typeof commits.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(commits)
      .values(data)
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  /**
   * Resolve full repository context from a pipeline_run ID.
   * Joins: pipeline_runs → commits → branches → repositories
   * Returns the info the repair agent needs to interact with GitHub.
   */
  async findPipelineRunContext(pipelineRunId: string): Promise<{
    repositoryId: string;
    installationId: string;
    owner: string;
    repo: string;
    provider: string;
    ciProviderConfigId: string | null;
    branchName?: string;
    commitSha?: string;
    runUrl?: string;
  } | null> {
    const [row] = await this.dbService.db
      .select({
        repositoryId: repositories.id,
        installationId: repositories.githubInstallationId,
        repoName: repositories.name,
        provider: repositories.provider,
        ciProviderConfigId: repositories.ciProviderConfigId,
        branchName: branches.name,
        commitSha: commits.commitSha,
        externalRunId: pipelineRuns.externalRunId,
      })
      .from(pipelineRuns)
      .innerJoin(commits, eq(pipelineRuns.commitId, commits.id))
      .innerJoin(branches, eq(commits.branchId, branches.id))
      .innerJoin(repositories, eq(branches.repositoryId, repositories.id))
      .where(eq(pipelineRuns.id, pipelineRunId));

    if (!row) return null;

    // Parse "owner/repo" from repo name, or fallback
    const parts = row.repoName.split('/');
    const owner = parts.length >= 2 ? (parts[0] ?? '') : '';
    const repo = parts.length >= 2 ? (parts[1] ?? '') : row.repoName;
    const result: {
      repositoryId: string;
      installationId: string;
      owner: string;
      repo: string;
      provider: string;
      ciProviderConfigId: string | null;
      branchName?: string;
      commitSha?: string;
      runUrl?: string;
    } = {
      repositoryId: row.repositoryId,
      installationId: row.installationId ?? '',
      owner,
      repo,
      provider: row.provider ?? 'github',
      ciProviderConfigId: row.ciProviderConfigId ?? null,
    };

    if (row.branchName) result.branchName = row.branchName;
    if (row.commitSha) result.commitSha = row.commitSha;
    if (row.externalRunId) {
      result.runUrl = `https://github.com/${owner}/${repo}/actions/runs/${row.externalRunId}`;
    }

    return result;
  }

  // ─── Pipeline Status by Commit SHA ──────────────────────────────────────

  /**
   * Find all pipeline runs for a given commit SHA.
   * Joins: commits → pipeline_runs, and includes repo + branch context.
   */
  async findPipelineRunsByCommitSha(commitSha: string) {
    return this.dbService.db
      .select({
        pipelineRunId: pipelineRuns.id,
        status: pipelineRuns.status,
        workflowName: pipelineRuns.workflowName,
        externalRunId: pipelineRuns.externalRunId,
        logUrl: pipelineRuns.logUrl,
        agentBranch: pipelineRuns.agentBranch,
        startedAt: pipelineRuns.startedAt,
        completedAt: pipelineRuns.completedAt,
        createdAt: pipelineRuns.createdAt,
        repoName: repositories.name,
        branchName: branches.name,
        commitSha: commits.commitSha,
        commitMessage: commits.message,
        commitAuthor: commits.author,
      })
      .from(commits)
      .innerJoin(pipelineRuns, eq(pipelineRuns.commitId, commits.id))
      .innerJoin(branches, eq(commits.branchId, branches.id))
      .innerJoin(repositories, eq(branches.repositoryId, repositories.id))
      .where(eq(commits.commitSha, commitSha))
      .orderBy(desc(pipelineRuns.createdAt));
  }
}
