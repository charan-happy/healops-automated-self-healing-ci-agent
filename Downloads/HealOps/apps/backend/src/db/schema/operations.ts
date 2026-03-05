// ─── Tier 7: Operations ─────────────────────────────────────────────────────
// slack_notifications, healops_audit_logs, cost_tracking, job_cooldowns

import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  integer,
  bigint,
  decimal,
  date,
  json,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { jobs } from './agent';
import { organizations, repositories } from './platform';

// ─── Slack Notifications ────────────────────────────────────────────────────

export const slackNotifications = pgTable(
  'slack_notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id),
    // pipeline_failed/pre_check_failed/runner_failed/pr_created/escalated/
    // superseded/budget_exceeded/flaky_detected
    type: varchar('type', { length: 100 }).notNull(),
    channel: varchar('channel', { length: 100 }),
    // sent/failed/throttled
    status: varchar('status', { length: 20 }).notNull().default('sent'),
    // CRITICAL: store from first message, reuse for threading
    slackThreadTs: varchar('slack_thread_ts', { length: 50 }),
    messagePreview: varchar('message_preview', { length: 200 }),
    payload: json('payload').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Look up thread_ts before sending follow-ups
    index('idx_slack_job_type').on(table.jobId, table.type),
  ],
);

// ─── HealOps Audit Logs ──────────────────────────────────────────────────
// Named healops_audit_logs to avoid collision with existing audit_logs table

export const healopsAuditLogs = pgTable(
  'healops_audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Table name being audited
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    // created/updated/deleted/status_changed/escalated
    action: varchar('action', { length: 100 }).notNull(),
    // system/developer/admin
    actorType: varchar('actor_type', { length: 50 }).notNull(),
    actorId: varchar('actor_id', { length: 255 }),
    oldValue: json('old_value'),
    newValue: json('new_value'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // MANDATORY: all compliance queries use this composite index
    index('idx_pp_audit_entity').on(table.entityType, table.entityId),
    index('idx_pp_audit_created').on(table.createdAt),
  ],
);

// ─── Cost Tracking ──────────────────────────────────────────────────────────

export const costTracking = pgTable(
  'cost_tracking',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id),
    // null = org-level aggregate
    repositoryId: uuid('repository_id').references(() => repositories.id),
    // First day of month e.g. 2025-02-01
    periodMonth: date('period_month').notNull(),
    totalInputTokens: bigint('total_input_tokens', { mode: 'number' })
      .notNull()
      .default(0),
    totalOutputTokens: bigint('total_output_tokens', { mode: 'number' })
      .notNull()
      .default(0),
    totalJobs: integer('total_jobs').notNull().default(0),
    totalJobsSucceeded: integer('total_jobs_succeeded').notNull().default(0),
    totalJobsEscalated: integer('total_jobs_escalated').notNull().default(0),
    estimatedCostUsd: decimal('estimated_cost_usd', {
      precision: 10,
      scale: 4,
    })
      .notNull()
      .default('0'),
    budgetLimitUsd: decimal('budget_limit_usd', { precision: 10, scale: 4 }),
    budgetExhausted: boolean('budget_exhausted').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // UPSERT key for monthly cost tracking
    uniqueIndex('idx_cost_org_repo_month').on(
      table.organizationId,
      table.repositoryId,
      table.periodMonth,
    ),
    index('idx_cost_budget_exhausted').on(table.budgetExhausted),
  ],
);

// ─── Job Cooldowns ──────────────────────────────────────────────────────────

export const jobCooldowns = pgTable(
  'job_cooldowns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => repositories.id),
    branchName: varchar('branch_name', { length: 255 }).notNull(),
    failureType: varchar('failure_type', { length: 100 }).notNull(),
    triggeredByJobId: uuid('triggered_by_job_id')
      .notNull()
      .references(() => jobs.id),
    // escalated/budget_exceeded/circular_fix/max_daily_jobs
    cooldownReason: varchar('cooldown_reason', { length: 50 }).notNull(),
    cooldownUntil: timestamp('cooldown_until', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_cooldown_repo_branch_type').on(
      table.repositoryId,
      table.branchName,
      table.failureType,
    ),
    index('idx_cooldown_until').on(table.cooldownUntil),
  ],
);
