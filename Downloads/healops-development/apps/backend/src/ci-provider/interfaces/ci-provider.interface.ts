// ─── CI Provider Interfaces ─────────────────────────────────────────────────
// Shared types for the multi-CI provider abstraction layer.
// Used by GitHub, GitLab, and Jenkins providers.

/**
 * Connection configuration for a CI/SCM provider.
 * The authToken is pre-resolved (e.g. GitHub installation access token,
 * GitLab private token, Jenkins API token).
 */
export interface CiConnectionConfig {
  owner: string;
  repo: string;
  authToken: string;
  /** Base URL for self-hosted instances (e.g. GitLab CE, Jenkins) */
  serverUrl?: string | undefined;
}

/**
 * Normalised webhook payload result.
 * All CI providers parse their raw webhook data into this common shape.
 */
export interface WebhookPayloadResult {
  /** Normalised event type: 'pipeline_failed' | 'pipeline_success' | 'push' */
  eventType: string;
  /** Provider-specific run/pipeline ID */
  externalRunId: string;
  /** Workflow or pipeline name */
  workflowName: string | null;
  /** Branch that triggered the pipeline */
  headBranch: string;
  /** Commit SHA at HEAD */
  headSha: string;
  /** Conclusion/status: 'failure' | 'success' | 'cancelled' etc. */
  conclusion: string;
  /** URL to the CI run in the provider's UI */
  runUrl: string | null;
  /** When the run started */
  startedAt: Date | null;
  /** When the run completed */
  completedAt: Date | null;
  /** Repository metadata */
  repository: {
    externalId: string;
    fullName: string;
    owner: string;
    repo: string;
    defaultBranch: string;
    language: string | null;
  };
  /** GitHub App installation (GitHub-only) */
  installation?: { id: string } | undefined;
  /** Organization/group metadata */
  organization?: { login: string; externalId: string } | undefined;
  /** Author of the HEAD commit */
  commitAuthor: string | null;
  /** Message of the HEAD commit */
  commitMessage: string | null;
  /** Raw provider payload for audit/debugging */
  raw: Record<string, unknown>;
}

/** Result of listing repositories accessible to this provider */
export interface ProviderRepository {
  externalRepoId: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  language: string | null;
  isPrivate: boolean;
  url: string;
}

/** Result of creating a pull request / merge request */
export interface CreatePrResult {
  number: number;
  url: string;
}

/** Result of creating an issue */
export interface CreateIssueResult {
  number: number;
  url: string;
}
