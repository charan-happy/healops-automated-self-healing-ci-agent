// ─── CI Provider Module ─────────────────────────────────────────────────────
// Multi-CI provider abstraction layer.
// Exports CiProviderFactory for use by webhook controllers and repair services.

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CiProviderFactory } from './ci-provider.factory';
import { GitHubCiProvider } from './providers/github-ci.provider';
import { GitLabCiProvider } from './providers/gitlab-ci.provider';
import { JenkinsCiProvider } from './providers/jenkins-ci.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    GitHubCiProvider,
    GitLabCiProvider,
    JenkinsCiProvider,
    CiProviderFactory,
  ],
  exports: [
    CiProviderFactory,
    GitHubCiProvider,
    GitLabCiProvider,
    JenkinsCiProvider,
  ],
})
export class CiProviderModule {}
