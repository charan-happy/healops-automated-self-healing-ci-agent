// ─── Vector Memory Module ───────────────────────────────────────────────────
// pgvector RAG for storing and retrieving similar fix patterns.
// Uses 1536-dimensional embeddings with HNSW index for fast cosine similarity.

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VectorMemoryService } from './vector-memory.service';

@Module({
  imports: [ConfigModule],
  providers: [VectorMemoryService],
  exports: [VectorMemoryService],
})
export class VectorMemoryModule {}
