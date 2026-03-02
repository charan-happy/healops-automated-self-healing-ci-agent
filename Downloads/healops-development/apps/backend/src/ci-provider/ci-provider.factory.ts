// ─── CI Provider Factory ────────────────────────────────────────────────────
// Registry of CI providers keyed by name ('github', 'gitlab', 'jenkins').
// Used by the webhook controller and repair agent to get the correct provider.

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CiProviderBase } from './providers/ci-provider.base';
import { GitHubCiProvider } from './providers/github-ci.provider';
import { GitLabCiProvider } from './providers/gitlab-ci.provider';
import { JenkinsCiProvider } from './providers/jenkins-ci.provider';
import { CiConnectionConfig } from './interfaces/ci-provider.interface';

@Injectable()
export class CiProviderFactory {
  private readonly logger = new Logger(CiProviderFactory.name);
  private readonly providers: Map<string, CiProviderBase>;

  constructor(
    private readonly configService: ConfigService,
    github: GitHubCiProvider,
    gitlab: GitLabCiProvider,
    jenkins: JenkinsCiProvider,
  ) {
    this.providers = new Map<string, CiProviderBase>([
      ['github', github],
      ['gitlab', gitlab],
      ['jenkins', jenkins],
    ]);
  }

  /**
   * Get a CI provider by name.
   * @throws Error if the provider name is not registered.
   */
  getProvider(name: string): CiProviderBase {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new Error(
        `Unknown CI provider "${name}". Registered providers: ${[...this.providers.keys()].join(', ')}`,
      );
    }
    return provider;
  }

  /**
   * List all registered provider names.
   */
  getProviderNames(): string[] {
    return [...this.providers.keys()];
  }

  /**
   * Build a CiConnectionConfig from a repository record.
   * Resolves auth tokens from environment variables based on the provider.
   *
   * For GitHub: uses the GitHub App installation token flow
   *   (the caller must resolve the installation access token first).
   * For GitLab: uses GITLAB_TOKEN env var.
   * For Jenkins: uses JENKINS_AUTH env var (username:apiToken).
   */
  buildConnectionConfig(repository: {
    name: string;
    githubInstallationId?: string | null | undefined;
    provider: string;
    authToken?: string | undefined;
  }): CiConnectionConfig {
    const provider = repository.provider.toLowerCase();

    if (provider === 'github') {
      const parts = repository.name.split('/');
      const owner = parts[0] ?? '';
      const repo = parts[1] ?? repository.name;

      return {
        owner,
        repo,
        authToken: repository.authToken ?? '',
        serverUrl: this.configService.get<string>('GITHUB_API_URL') ?? undefined,
      };
    }

    if (provider === 'gitlab') {
      // For GitLab, repo holds the project ID or URL-encoded path
      return {
        owner: '',
        repo: repository.name,
        authToken: repository.authToken
          ?? this.configService.get<string>('GITLAB_TOKEN')
          ?? '',
        serverUrl: this.configService.get<string>('GITLAB_URL') ?? undefined,
      };
    }

    if (provider === 'jenkins') {
      // Jenkins: authToken = "username:apiToken"
      return {
        owner: '',
        repo: repository.name,
        authToken: repository.authToken
          ?? this.configService.get<string>('JENKINS_AUTH')
          ?? '',
        serverUrl: this.configService.get<string>('JENKINS_URL') ?? undefined,
      };
    }

    this.logger.warn(`Unknown provider "${provider}" — returning empty config`);
    return {
      owner: '',
      repo: repository.name,
      authToken: '',
    };
  }
}
