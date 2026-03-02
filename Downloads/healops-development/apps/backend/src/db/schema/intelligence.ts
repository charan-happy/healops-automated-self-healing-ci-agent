// ─── Tier 6: Intelligence ───────────────────────────────────────────────────
// vector_memory (pgvector with HNSW index)

import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  real,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';
import { repositories } from './platform';
import { jobs } from './agent';

// ─── pgvector Custom Type ───────────────────────────────────────────────────
// Drizzle does not natively support pgvector — use customType for embedding column

const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(',')
      .map(Number);
  },
});

// ─── Vector Memory ──────────────────────────────────────────────────────────
// Stores successful fix patterns with embeddings for RAG-based similar fix retrieval
//
// IMPORTANT: The HNSW index for vector similarity search must be created via
// raw SQL migration (cannot use Drizzle's index() API):
//
//   CREATE EXTENSION IF NOT EXISTS vector;
//   CREATE INDEX IF NOT EXISTS idx_vector_memory_embedding
//     ON vector_memory USING hnsw (error_embedding vector_cosine_ops)
//     WITH (m = 16, ef_construction = 64);

export const vectorMemory = pgTable(
  'vector_memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    repositoryId: uuid('repository_id').references(() => repositories.id),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id),
    // 1536-dimensional embedding vector (OpenAI text-embedding-3-small compatible)
    errorEmbedding: vector('error_embedding'),
    // SHA-256 to prevent duplicate embeddings
    contextHash: varchar('context_hash', { length: 64 }).notNull().unique(),
    // error_types.code
    failureType: varchar('failure_type', { length: 100 }).notNull(),
    language: varchar('language', { length: 50 }).notNull(),
    // The diff that worked
    successfulPatch: text('successful_patch').notNull(),
    confidence: real('confidence').notNull(),
    usageCount: integer('usage_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Soft delete
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('idx_vector_memory_context_hash').on(table.contextHash),
    index('idx_vector_memory_repo_lang_type').on(
      table.repositoryId,
      table.language,
      table.failureType,
    ),
  ],
);
