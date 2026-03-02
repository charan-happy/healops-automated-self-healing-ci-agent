-- ─── HealOps: Enable pgvector extension + HNSW index ─────────────────────
-- This migration must run AFTER the vector_memory table is created.
-- pgvector extension is required for embedding storage and similarity search.

CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW index for fast cosine similarity search on error embeddings.
-- Parameters:
--   m = 16: max number of connections per layer (higher = more accurate, more memory)
--   ef_construction = 64: size of dynamic candidate list during index build
-- This index enables sub-linear time nearest-neighbor search on the 1536-dim vectors.
CREATE INDEX IF NOT EXISTS idx_vector_memory_embedding
  ON vector_memory USING hnsw (error_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
