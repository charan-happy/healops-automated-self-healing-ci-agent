// ─── Tier 1: Platform Foundation ────────────────────────────────────────────
// organizations, repositories, repository_settings, branches, commits

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  json,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── Organizations ──────────────────────────────────────────────────────────

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull(),
  plan: varchar('plan', { length: 50 }).notNull().default('free'),
  slackWebhookUrl: varchar('slack_webhook_url', { length: 500 }),
  monthlyJobLimit: integer('monthly_job_limit').default(100),
  monthlyTokenBudget: integer('monthly_token_budget').default(1000000),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// ─── Repositories ───────────────────────────────────────────────────────────

export const repositories = pgTable(
  'repositories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    provider: varchar('provider', { length: 50 }).notNull(),
    externalRepoId: varchar('external_repo_id', { length: 255 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    defaultBranch: varchar('default_branch', { length: 100 })
      .notNull()
      .default('main'),
    primaryLanguage: varchar('primary_language', { length: 50 }),
    isActive: boolean('is_active').notNull().default(true),
    webhookSecret: varchar('webhook_secret', { length: 500 }),
    githubInstallationId: varchar('github_installation_id', { length: 100 }),
    ciProviderConfigId: uuid('ci_provider_config_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('idx_repositories_provider_external_repo_id').on(
      table.provider,
      table.externalRepoId,
    ),
  ],
);

// ─── Repository CI Links (many-to-many: repos ↔ CI providers) ──────────────

export const repositoryCiLinks = pgTable(
  'repository_ci_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => repositories.id),
    ciProviderConfigId: uuid('ci_provider_config_id').notNull(),
    pipelineName: varchar('pipeline_name', { length: 255 }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_repo_ci_links_unique').on(
      table.repositoryId,
      table.ciProviderConfigId,
    ),
    index('idx_repo_ci_links_repo').on(table.repositoryId),
  ],
);

// ─── Repository Settings ────────────────────────────────────────────────────

export const repositorySettings = pgTable('repository_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  repositoryId: uuid('repository_id')
    .notNull()
    .references(() => repositories.id)
    .unique(),
  slackChannel: varchar('slack_channel', { length: 100 }),
  slackWebhookUrl: varchar('slack_webhook_url', { length: 500 }),
  maxJobsPerDay: integer('max_jobs_per_day').notNull().default(10),
  maxRetries: integer('max_retries').notNull().default(3),
  tokenBudgetPerJob: integer('token_budget_per_job').notNull().default(100000),
  allowedFailureTypes: json('allowed_failure_types'),
  blockedBranches: json('blocked_branches'),
  createDraftPr: boolean('create_draft_pr').notNull().default(true),
  autoMergePr: boolean('auto_merge_pr').notNull().default(false),
  autoMergeThreshold: real('auto_merge_threshold').notNull().default(0.95),
  notifyOnStart: boolean('notify_on_start').notNull().default(false),
  notifyOnSuperseded: boolean('notify_on_superseded').notNull().default(true),
  validationWorkflowFile: varchar('validation_workflow_file', { length: 100 })
    .notNull()
    .default('healops-validation.yml'),
  pathLanguageMap: json('path_language_map'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Branches ───────────────────────────────────────────────────────────────

export const branches = pgTable(
  'branches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => repositories.id),
    name: varchar('name', { length: 255 }).notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    // CRITICAL: true for healops/fix/* branches — webhook loop prevention
    isHealopsBranch: boolean('is_healops_branch')
      .notNull()
      .default(false),
    isProtected: boolean('is_protected').notNull().default(false),
    // Set to NOW()+48h on creation for fix branches
    autoDeleteAfter: timestamp('auto_delete_after', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_branches_repo_name').on(table.repositoryId, table.name),
    // For cleanup queries: find expired healops branches
    index('idx_branches_healops_cleanup').on(
      table.isHealopsBranch,
      table.autoDeleteAfter,
    ),
  ],
);

// ─── Commits ────────────────────────────────────────────────────────────────

export const commits = pgTable(
  'commits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => repositories.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    commitSha: varchar('commit_sha', { length: 40 }).notNull(),
    author: varchar('author', { length: 255 }).notNull(),
    message: text('message'),
    // CRITICAL: developer|healops — loop prevention
    source: varchar('source', { length: 50 }).notNull().default('developer'),
    committedAt: timestamp('committed_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_commits_repo_sha').on(
      table.repositoryId,
      table.commitSha,
    ),
    index('idx_commits_branch_source').on(table.branchId, table.source),
  ],
);
