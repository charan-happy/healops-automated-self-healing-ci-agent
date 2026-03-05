// ─── Tier 5: Outputs ────────────────────────────────────────────────────────
// pull_requests, escalations

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { jobs } from './agent';

// ─── Pull Requests ──────────────────────────────────────────────────────────

export const pullRequests = pgTable(
  'pull_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id),
    // GitHub PR number
    externalPrId: varchar('external_pr_id', { length: 100 }).notNull(),
    prUrl: varchar('pr_url', { length: 500 }).notNull(),
    // healops/fix/{job_id}
    sourceBranch: varchar('source_branch', { length: 255 }).notNull(),
    targetBranch: varchar('target_branch', { length: 255 }).notNull(),
    // open/merged/closed/superseded
    status: varchar('status', { length: 50 }).notNull().default('open'),
    // SAFETY: ALL AI PRs start as draft — cannot be auto-merged
    isDraft: boolean('is_draft').notNull().default(true),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    supersededByCommit: varchar('superseded_by_commit', { length: 40 }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    mergedAt: timestamp('merged_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_pr_job_status').on(table.jobId, table.status),
    // Prevent duplicate PRs per branch
    index('idx_pr_target_status').on(table.targetBranch, table.status),
  ],
);

// ─── Escalations ────────────────────────────────────────────────────────────

export const escalations = pgTable(
  'escalations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id),
    // max_retries/circular_fix/budget_exceeded/unfixable_type/low_confidence
    escalationType: varchar('escalation_type', { length: 50 }).notNull(),
    // GitHub Issue number
    externalIssueId: varchar('external_issue_id', { length: 100 }),
    issueUrl: varchar('issue_url', { length: 500 }),
    // Detailed explanation of all attempts
    reason: text('reason').notNull(),
    // MTTR = resolved_at - created_at
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_escalations_job_type').on(table.jobId, table.escalationType),
    // Open escalations: WHERE resolved_at IS NULL
    index('idx_escalations_resolved').on(table.resolvedAt),
  ],
);
