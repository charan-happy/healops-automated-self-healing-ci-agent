export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan: string;
  createdAt: string;
}

export interface Member {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "member" | "viewer";
  joinedAt: string;
}

export interface CIProviderConfig {
  id: string;
  providerType: string;
  displayName: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface SCMProviderConfig {
  id: string;
  providerType: string;
  displayName: string | null;
  isActive: boolean;
  hasToken: boolean;
  createdAt: string;
}

export interface AIConfig {
  provider: string;
  model: string;
  baseUrl?: string;
}

export interface BillingPlan {
  id: string;
  name: string;
  slug: string;
  priceCents: number;
  monthlyJobLimit: number;
  monthlyTokenBudget: number;
  features: string[];
}

export interface Subscription {
  id: string;
  plan: BillingPlan;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

export interface UsageStats {
  jobsUsed: number;
  jobsLimit: number;
  tokensUsed: number;
  tokensLimit: number;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}
