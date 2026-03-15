// ─── Projects Module ────────────────────────────────────────────────────────
// Lists repositories, branches, and commits for the authenticated user's org.

import { Module } from '@nestjs/common';
import { GithubModule } from '../github/github.module';
import { RepairAgentModule } from '../repair-agent/repair-agent.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { ErrorExtractorService } from '../ci-webhook/error-extractor.service';

@Module({
  imports: [GithubModule, RepairAgentModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ErrorExtractorService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
