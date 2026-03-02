// ─── GitHub App Provider ────────────────────────────────────────────────────
// Manages GitHub App authentication: JWT generation + installation token cache.
// Includes singleflight pattern (EC-33) and permission check on init (EC-52).

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

@Injectable()
export class GithubAppProvider implements OnModuleInit {
  private readonly logger = new Logger(GithubAppProvider.name);
  private readonly installationClients = new Map<string, { octokit: Octokit; expiresAt: number }>();

  /** Singleflight: in-flight refresh promises keyed by installationId (EC-33) */
  private readonly refreshPromises = new Map<string, Promise<Octokit>>();

  constructor(private readonly configService: ConfigService) {}

  /**
   * EC-52: Verify GitHub App permissions on startup.
   * Logs warnings for missing permissions but does NOT crash
   * (app serves non-HealOps routes too).
   */
  async onModuleInit(): Promise<void> {
    const appId = this.configService.get<string>('GITHUB_APP_ID') ?? '';
    const privateKey = (this.configService.get<string>('GITHUB_APP_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

    if (!appId || !privateKey) {
      this.logger.warn('GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY not configured — skipping permission check');
      return;
    }

    try {
      const appOctokit = new Octokit({
        authStrategy: createAppAuth,
        auth: { appId, privateKey },
      });

      const { data } = await appOctokit.apps.getAuthenticated();
      const perms = data?.permissions ?? {};
      const required = ['contents', 'pull_requests', 'issues', 'actions'] as const;

      for (const perm of required) {
        if (!perms[perm] || perms[perm] === 'none') {
          this.logger.warn(`GitHub App missing permission: "${perm}" — HealOps features may not work`);
        }
      }

      this.logger.log('GitHub App permissions verified');
    } catch (error) {
      this.logger.warn(`Could not verify GitHub App permissions: ${(error as Error).message}`);
    }
  }

  /**
   * Get an authenticated Octokit client for a GitHub App installation.
   * Caches clients and refreshes when tokens expire.
   * Uses singleflight pattern (EC-33) to prevent thundering herd.
   */
  async getInstallationClient(installationId: string): Promise<Octokit> {
    const cached = this.installationClients.get(installationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.octokit;
    }

    // Singleflight: if a refresh is already in-flight, reuse it
    const existing = this.refreshPromises.get(installationId);
    if (existing) {
      return existing;
    }

    const promise = this.doRefreshClient(installationId);
    this.refreshPromises.set(installationId, promise);

    try {
      return await promise;
    } finally {
      this.refreshPromises.delete(installationId);
    }
  }

  private async doRefreshClient(installationId: string): Promise<Octokit> {
    const appId = this.configService.get<string>('GITHUB_APP_ID') ?? '';
    const privateKey = (this.configService.get<string>('GITHUB_APP_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

    const octokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId,
        privateKey,
        installationId: Number(installationId),
      },
    });

    // Cache for 50 minutes (installation tokens expire after 1 hour)
    this.installationClients.set(installationId, {
      octokit,
      expiresAt: Date.now() + 50 * 60 * 1000,
    });

    this.logger.debug(`Created Octokit client for installation ${installationId}`);
    return octokit;
  }
}
