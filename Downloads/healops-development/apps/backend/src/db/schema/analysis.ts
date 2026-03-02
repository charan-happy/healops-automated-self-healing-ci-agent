// ─── Tier 3: Failure Analysis ───────────────────────────────────────────────
// failures, flaky_failure_registry

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { pipelineRuns, errorTypes } from './ingestion';
import { repositories } from './platform';

// ─── Failures ───────────────────────────────────────────────────────────────

export const failures = pgTable(
  'failures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    pipelineRunId: uuid('pipeline_run_id')
      .notNull()
      .references(() => pipelineRuns.id),
    errorTypeId: uuid('error_type_id')
      .notNull()
      .references(() => errorTypes.id),
    errorSummary: text('error_summary').notNull(),
    // SHA-256 of normalised error (strip line numbers, timestamps, SHAs)
    errorHash: varchar('error_hash', { length: 64 }).notNull(),
    rawErrorLog: text('raw_error_log'),
    affectedFile: varchar('affected_file', { length: 500 }),
    affectedLine: integer('affected_line'),
    // ts/js/python/go
    language: varchar('language', { length: 50 }).notNull(),
    isFlaky: boolean('is_flaky').notNull().default(false),
    detectedAt: timestamp('detected_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_failures_pipeline_hash').on(
      table.pipelineRunId,
      table.errorHash,
    ),
    index('idx_failures_error_hash').on(table.errorHash),
    index('idx_failures_is_flaky').on(table.isFlaky),
  ],
);

// ─── Flaky Failure Registry ─────────────────────────────────────────────────

export const flakyFailureRegistry = pgTable(
  'flaky_failure_registry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id')
      .notNull()
      .references(() => repositories.id),
    errorHash: varchar('error_hash', { length: 64 }).notNull(),
    testName: varchar('test_name', { length: 500 }),
    occurrenceCount: integer('occurrence_count').notNull().default(1),
    // 3+ = flaky confirmed
    distinctCommits: integer('distinct_commits').notNull().default(1),
    flakyConfirmed: boolean('flaky_confirmed').notNull().default(false),
    suppressedUntil: timestamp('suppressed_until', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('idx_flaky_repo_hash').on(
      table.repositoryId,
      table.errorHash,
    ),
    index('idx_flaky_confirmed').on(table.flakyConfirmed),
  ],
);
