export interface OnboardingData {
  organization: {
    name: string;
    teamSize: string;
  };
  ciProvider: {
    type: "github" | "gitlab" | "bitbucket" | "jenkins";
    config: Record<string, string>;
  };
  repositories: Array<{
    externalRepoId: string;
    name: string;
    defaultBranch?: string;
  }>;
  aiConfig: {
    provider: "claude" | "openai" | "openrouter" | "local";
    config: Record<string, string>;
  };
}

export type OnboardingStep =
  | "create_organization"
  | "select_ci_provider"
  | "select_repositories"
  | "configure_ai"
  | "review_activate";

export interface OnboardingStatus {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  isComplete: boolean;
  data: Partial<OnboardingData>;
  completedAt: string | null;
}
