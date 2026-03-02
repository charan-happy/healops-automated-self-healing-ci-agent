// ─── Fix Requests ───────────────────────────────────────────────────────────
// API-driven error reports for the /fix-request endpoint.
// This is the ingestion entry point for errors reported directly via API
// (as opposed to failures detected from CI/CD pipeline webhooks).
//
// NOTE: job_id FK to jobs table is enforced at DB level (migration SQL).
// We avoid importing from './agent' here to prevent a circular dependency
// (agent.ts already imports fix-requests.ts for the fix_request_id FK).

import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  index,
} from 'drizzle-orm/pg-core';

export const fixRequests = pgTable(
  'fix_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    errorMessage: text('error_message').notNull(),
    codeSnippet: text('code_snippet').notNull(),
    lineNumber: integer('line_number').notNull(),
    filePath: varchar('file_path', { length: 500 }),
    language: varchar('language', { length: 50 }),
    branch: varchar('branch', { length: 255 }).notNull(),
    commitSha: varchar('commit_sha', { length: 40 }).notNull(),
    // SHA-256 of normalised error message for deduplication
    errorHash: varchar('error_hash', { length: 64 }).notNull(),
    // Set after AI classification
    classifiedErrorType: varchar('classified_error_type', { length: 100 }),
    isInScope: boolean('is_in_scope'),
    scopeReason: text('scope_reason'),
    // received → classifying → processing → completed / failed / out_of_scope
    status: varchar('status', { length: 50 }).notNull().default('received'),
    // Linked after job creation (FK enforced at DB level)
    jobId: uuid('job_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_fix_requests_error_hash').on(table.errorHash),
    index('idx_fix_requests_status').on(table.status),
    index('idx_fix_requests_branch_commit').on(table.branch, table.commitSha),
  ],
);
