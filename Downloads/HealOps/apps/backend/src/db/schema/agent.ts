// ─── Tier 4: Agent Execution ────────────────────────────────────────────────
// jobs, attempts, patches, validations

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
import { failures } from './analysis';
import { fixRequests } from './fix-requests';
import { pipelineRuns } from './ingestion';

// ─── Jobs ───────────────────────────────────────────────────────────────────

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    failureId: uuid('failure_id').references(() => failures.id),
    fixRequestId: uuid('fix_request_id').references(
      () => fixRequests.id,
    ),
    // queued/running/success/failed/escalated/superseded/flaky_skipped/budget_exceeded/circular_fix_detected
    status: varchar('status', { length: 50 }).notNull().default('queued'),
    // What Claude diagnosed (may differ from initial classification)
    classifiedFailureType: varchar('classified_failure_type', { length: 100 }),
    confidence: real('confidence'),
    maxRetries: integer('max_retries').notNull().default(3),
    currentRetry: integer('current_retry').notNull().default(0),
    tokenBudget: integer('token_budget').notNull().default(100000),
    totalTokensUsed: integer('total_tokens_used').notNull().default(0),
    supersededByCommit: varchar('superseded_by_commit', { length: 40 }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_jobs_failure_status').on(table.failureId, table.status),
    index('idx_jobs_status_created').on(table.status, table.createdAt),
  ],
);

// ─── Attempts ───────────────────────────────────────────────────────────────

export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id),
    // 1-based attempt number
    attemptNumber: integer('attempt_number').notNull(),
    // {diagnosis, fix_strategy, confidence, can_fix, cannot_fix_reason}
    analysisOutput: json('analysis_output'),
    // SHA-256 of normalised diff — circular fix detection
    fixFingerprint: varchar('fix_fingerprint', { length: 64 }),
    secretRedactionsCount: integer('secret_redactions_count')
      .notNull()
      .default(0),
    // Links attempt → its GitHub CI validation run
    validationRunId: uuid('validation_run_id').references(
      () => pipelineRuns.id,
    ),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    latencyMs: integer('latency_ms'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_attempts_job_number').on(table.jobId, table.attemptNumber),
    // Circular fix detection: same diff produced twice = circular
    index('idx_attempts_job_fingerprint').on(
      table.jobId,
      table.fixFingerprint,
    ),
    index('idx_attempts_validation_run').on(table.validationRunId),
  ],
);

// ─── Patches ────────────────────────────────────────────────────────────────

export const patches = pgTable('patches', {
  id: uuid('id').primaryKey().defaultRandom(),
  // One patch per attempt (1:1)
  attemptId: uuid('attempt_id')
    .notNull()
    .references(() => attempts.id)
    .unique(),
  // Unified diff format
  diffContent: text('diff_content').notNull(),
  // [{path, additions, deletions}]
  filesModified: json('files_modified').notNull(),
  patchSize: integer('patch_size').notNull(),
  // QUALITY GATE: as any or @ts-ignore
  hasTypeAssertions: boolean('has_type_assertions').notNull().default(false),
  // QUALITY GATE: empty catch block
  hasEmptyCatch: boolean('has_empty_catch').notNull().default(false),
  // passed/warnings/failed — from runner npm audit
  securityScanStatus: varchar('security_scan_status', { length: 50 }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Validations ────────────────────────────────────────────────────────────

export const validations = pgTable(
  'validations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id),
    // pre_check | runner
    stage: varchar('stage', { length: 20 }).notNull(),
    // success/failed
    buildStatus: varchar('build_status', { length: 20 }).notNull(),
    // success/failed/skipped
    testStatus: varchar('test_status', { length: 20 }).notNull(),
    buildLogExcerpt: text('build_log_excerpt'),
    testLogExcerpt: text('test_log_excerpt'),
    buildLogUrl: varchar('build_log_url', { length: 500 }),
    testLogUrl: varchar('test_log_url', { length: 500 }),
    // e.g. node/20.11
    runtimeVersion: varchar('runtime_version', { length: 50 }),
    coveragePercent: real('coverage_percent'),
    securityScanStatus: varchar('security_scan_status', { length: 50 }),
    executionTimeMs: integer('execution_time_ms'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // One pre_check row + one runner row per attempt
    uniqueIndex('idx_validations_attempt_stage').on(
      table.attemptId,
      table.stage,
    ),
  ],
);
