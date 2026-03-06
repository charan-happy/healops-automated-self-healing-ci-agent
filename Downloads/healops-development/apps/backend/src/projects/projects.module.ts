import { Module } from '@nestjs/common';
import { GithubModule } from '../github/github.module';
import { CiProviderModule } from '../ci-provider/ci-provider.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [GithubModule, CiProviderModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
