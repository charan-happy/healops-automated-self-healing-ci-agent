export type CiProviderType = "github" | "gitlab" | "bitbucket" | "jenkins";
export type ScmProviderType = "github" | "gitlab" | "bitbucket";

export interface CiProviderEntry {
  type: CiProviderType;
  config: Record<string, string>;
  /** Populated after backend save during onboarding */
  providerConfigId?: string;
}

export interface ScmProviderEntry {
  type: ScmProviderType;
  config: Record<string, string>;
  /** Populated after backend save during onboarding */
  providerConfigId?: string;
}

export interface OnboardingData {
  organization: {
    name: string;
    teamSize: string;
  };
  /** @deprecated Use ciProviders array instead */
  ciProvider: {
    type: CiProviderType;
    config: Record<string, string>;
  };
  /** Multi-provider support — one or more CI providers */
  ciProviders: CiProviderEntry[];
  /** SCM providers — where source code lives */
  scmProviders: ScmProviderEntry[];
  repositories: Array<{
    externalRepoId: string;
    name: string;
    defaultBranch?: string;
    /** Which provider config this repo belongs to */
    providerConfigId?: string;
  }>;
  aiConfig: {
    provider: "claude" | "openai" | "openrouter" | "local";
    config: Record<string, string>;
  };
}

export type OnboardingStep =
  | "create_organization"
  | "select_ci_provider"
  | "select_scm_provider"
  | "select_repositories"
  | "configure_ai"
  | "review_activate";

export interface OnboardingStatus {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  isComplete: boolean;
  /** Organization details (top-level to avoid TransformInterceptor collision) */
  organization?: { id: string; name: string; slug: string };
  /** Onboarding progress config data (renamed from 'data' to avoid interceptor collision) */
  config?: Partial<OnboardingData>;
  completedAt: string | null;
}
