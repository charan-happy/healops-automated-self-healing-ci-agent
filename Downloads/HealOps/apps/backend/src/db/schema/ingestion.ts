// ─── Tier 2: Event Ingestion ────────────────────────────────────────────────
// webhook_events, pipeline_runs, error_types

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  json,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { commits, repositories } from './platform';

// ─── Webhook Events ─────────────────────────────────────────────────────────

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => repositories.id),
    provider: varchar('provider', { length: 50 }).notNull(),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    // GitHub X-GitHub-Delivery header — idempotency key
    externalEventId: varchar('external_event_id', { length: 255 }).notNull(),
    payload: json('payload').notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    processed: boolean('processed').notNull().default(false),
    processingError: text('processing_error'),
    receivedAt: timestamp('received_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Idempotency: ON CONFLICT (external_event_id) DO NOTHING
    uniqueIndex('idx_webhook_events_external_id').on(table.externalEventId),
    index('idx_webhook_events_repo_processed').on(
      table.repositoryId,
      table.processed,
    ),
  ],
);

// ─── Pipeline Runs ──────────────────────────────────────────────────────────

export const pipelineRuns = pgTable(
  'pipeline_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commitId: uuid('commit_id')
      .notNull()
      .references(() => commits.id),
    webhookEventId: uuid('webhook_event_id').references(
      () => webhookEvents.id,
    ),
    externalRunId: varchar('external_run_id', { length: 255 }).notNull(),
    workflowName: varchar('workflow_name', { length: 255 }),
    provider: varchar('provider', { length: 50 }).notNull(),
    // queued/running/success/failed/cancelled
    status: varchar('status', { length: 50 }).notNull(),
    logUrl: varchar('log_url', { length: 500 }),
    // Max 8k tokens, error-relevant section only
    extractedLogSnippet: text('extracted_log_snippet'),
    rerunTriggered: boolean('rerun_triggered').notNull().default(false),
    rerunPassed: boolean('rerun_passed'),
    agentBranch: varchar('agent_branch', { length: 255 }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_pipeline_runs_commit_status').on(table.commitId, table.status),
    index('idx_pipeline_runs_external_run_id').on(table.externalRunId),
    index('idx_pipeline_runs_workflow_name').on(table.workflowName),
  ],
);

// ─── Error Types (Seed Table) ───────────────────────────────────────────────

export const errorTypes = pgTable('error_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 100 }).notNull().unique(),
  description: text('description').notNull(),
  // low/medium/high
  severity: varchar('severity', { length: 20 }).notNull().default('medium'),
  isAutoFixable: boolean('is_auto_fixable').notNull().default(true),
  avgFixTimeMs: integer('avg_fix_time_ms'),
});
