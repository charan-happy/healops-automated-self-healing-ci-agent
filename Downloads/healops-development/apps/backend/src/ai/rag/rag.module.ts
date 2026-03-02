import { Module } from '@nestjs/common';
import { AiModule } from '../ai.module';
import { ChunkingService } from './chunking.service';
import { EmbeddingService } from './embedding.service';
import { RetrievalService } from './retrieval.service';
import { RagService } from './rag.service';

@Module({
  imports: [AiModule],
  providers: [
    ChunkingService,
    EmbeddingService,
    RetrievalService,
    RagService,
  ],
  exports: [RagService, RetrievalService],
})
export class RagModule {}
