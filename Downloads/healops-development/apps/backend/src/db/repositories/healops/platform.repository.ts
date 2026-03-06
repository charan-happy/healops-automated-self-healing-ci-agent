// ─── Platform Repository ────────────────────────────────────────────────────
// Data access for: organizations, repositories, repository_settings, branches, commits

import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import {
  organizations,
  repositories,
  repositoryCiLinks,
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

  async findOrganizationBySlug(slug: string) {
    const [row] = await this.dbService.db
      .select()
      .from(organizations)
      .where(eq(organizations.slug, slug));
    return row ?? null;
  }

  /**
   * Find or create an organization by name.
   * Handles concurrent webhook race conditions by catching unique violations
   * and falling back to a lookup. Also handles slug collisions by appending
   * a numeric suffix when the generated slug already exists.
   */
  async createOrganization(data: typeof organizations.$inferInsert) {
    // Check if org already exists by name
    const [existing] = await this.dbService.db
      .select()
      .from(organizations)
      .where(eq(organizations.name, data.name));
    if (existing) return existing;

    // Check by slug to avoid unique constraint violation on idx_organizations_slug
    if (data.slug) {
      const [existingBySlug] = await this.dbService.db
        .select()
        .from(organizations)
        .where(eq(organizations.slug, data.slug));
      if (existingBySlug) {
        // Slug collision with a different name: append numeric suffix
        let suffix = 2;
        let uniqueSlug = `${data.slug}-${String(suffix)}`;
        while (true) {
          const [conflict] = await this.dbService.db
            .select()
            .from(organizations)
            .where(eq(organizations.slug, uniqueSlug));
          if (!conflict) break;
          suffix++;
          uniqueSlug = `${data.slug}-${String(suffix)}`;
        }
        data = { ...data, slug: uniqueSlug };
      }
    }

    try {
      const [row] = await this.dbService.db
        .insert(organizations)
        .values(data)
        .returning();
      if (!row) throw new Error('Failed to create organization');
      return row;
    } catch {
      // Race condition: another request created it between our check and insert
      const [fallbackByName] = await this.dbService.db
        .select()
        .from(organizations)
        .where(eq(organizations.name, data.name));
      if (fallbackByName) return fallbackByName;

      // Also try finding by slug in case the name differs slightly
      if (data.slug) {
        const [fallbackBySlug] = await this.dbService.db
          .select()
          .from(organizations)
          .where(eq(organizations.slug, data.slug));
        if (fallbackBySlug) return fallbackBySlug;
      }
      throw new Error('Failed to create or find organization');
    }
  }

  async updateOrganization(
    id: string,
    data: { name?: string; slug?: string; slackWebhookUrl?: string | null },
  ) {
    const setData: Record<string, unknown> = {};
    if (data.name !== undefined) setData['name'] = data.name;
    if (data.slug !== undefined) setData['slug'] = data.slug;
    if (data.slackWebhookUrl !== undefined)
      setData['slackWebhookUrl'] = data.slackWebhookUrl;

    if (Object.keys(setData).length === 0) return this.findOrganizationById(id);

    const [row] = await this.dbService.db
      .update(organizations)
      .set(setData)
      .where(eq(organizations.id, id))
      .returning();
    return row ?? null;
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

  // ─── Project / Branch / Commit Browsing ────────────────────────────────

  async findRepositoriesWithBranchCount(organizationId: string) {
    return this.dbService.db
      .select({
        id: repositories.id,
        name: repositories.name,
        provider: repositories.provider,
        externalRepoId: repositories.externalRepoId,
        defaultBranch: repositories.defaultBranch,
        githubInstallationId: repositories.githubInstallationId,
        isActive: repositories.isActive,
        createdAt: repositories.createdAt,
        branchCount: sql<number>`(
          SELECT count(*)::int FROM branches
          WHERE branches.repository_id = "repositories"."id"
        )`,
        lastActivity: sql<string | null>`(
          SELECT max(c.committed_at)::text FROM commits c
          INNER JOIN branches b ON c.branch_id = b.id
          WHERE b.repository_id = "repositories"."id"
        )`,
      })
      .from(repositories)
      .where(
        and(
          eq(repositories.organizationId, organizationId),
          eq(repositories.isActive, true),
        ),
      )
      .orderBy(desc(repositories.createdAt));
  }

  async findBranchesByRepository(
    repositoryId: string,
    includeHealopsBranches = false,
  ) {
    const conditions = [eq(branches.repositoryId, repositoryId)];
    if (!includeHealopsBranches) {
      conditions.push(eq(branches.isHealopsBranch, false));
    }

    return this.dbService.db
      .select({
        id: branches.id,
        name: branches.name,
        isDefault: branches.isDefault,
        isProtected: branches.isProtected,
        createdAt: branches.createdAt,
        commitCount: sql<number>`(
          SELECT count(*)::int FROM commits
          WHERE commits.branch_id = "branches"."id"
        )`,
        lastCommitAt: sql<string | null>`(
          SELECT max(committed_at)::text FROM commits
          WHERE commits.branch_id = "branches"."id"
        )`,
        lastCommitAuthor: sql<string | null>`(
          SELECT author FROM commits
          WHERE commits.branch_id = "branches"."id"
          ORDER BY committed_at DESC LIMIT 1
        )`,
      })
      .from(branches)
      .where(and(...conditions))
      .orderBy(desc(branches.createdAt));
  }

  async findCommitsByBranch(branchId: string, limit = 30, offset = 0) {
    return this.dbService.db
      .select({
        id: commits.id,
        commitSha: commits.commitSha,
        author: commits.author,
        message: commits.message,
        source: commits.source,
        committedAt: commits.committedAt,
      })
      .from(commits)
      .where(eq(commits.branchId, branchId))
      .orderBy(desc(commits.committedAt))
      .limit(limit)
      .offset(offset);
  }

  async findBranchById(branchId: string) {
    const [row] = await this.dbService.db
      .select()
      .from(branches)
      .where(eq(branches.id, branchId));
    return row ?? null;
  }

  async upsertBranch(data: typeof branches.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(branches)
      .values(data)
      .onConflictDoUpdate({
        target: [branches.repositoryId, branches.name],
        set: {
          isDefault: data.isDefault ?? false,
          isProtected: data.isProtected ?? false,
        },
      })
      .returning();
    return row ?? null;
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

  // ─── Repository CI Links ────────────────────────────────────────────────

  async findCiLinksByRepository(repositoryId: string) {
    return this.dbService.db
      .select()
      .from(repositoryCiLinks)
      .where(
        and(
          eq(repositoryCiLinks.repositoryId, repositoryId),
          eq(repositoryCiLinks.isActive, true),
        ),
      );
  }

  async createCiLink(data: {
    repositoryId: string;
    ciProviderConfigId: string;
    pipelineName?: string | undefined;
  }) {
    const [row] = await this.dbService.db
      .insert(repositoryCiLinks)
      .values({
        repositoryId: data.repositoryId,
        ciProviderConfigId: data.ciProviderConfigId,
        pipelineName: data.pipelineName ?? null,
      })
      .onConflictDoNothing()
      .returning();
    return row ?? null;
  }

  async updateCiLink(
    id: string,
    data: { pipelineName?: string | null; isActive?: boolean },
  ) {
    const setData: Record<string, unknown> = {};
    if (data.pipelineName !== undefined) setData['pipelineName'] = data.pipelineName;
    if (data.isActive !== undefined) setData['isActive'] = data.isActive;
    if (Object.keys(setData).length === 0) return null;

    const [row] = await this.dbService.db
      .update(repositoryCiLinks)
      .set(setData)
      .where(eq(repositoryCiLinks.id, id))
      .returning();
    return row ?? null;
  }

  async removeCiLink(id: string) {
    const [row] = await this.dbService.db
      .delete(repositoryCiLinks)
      .where(eq(repositoryCiLinks.id, id))
      .returning();
    return row ?? null;
  }
}
