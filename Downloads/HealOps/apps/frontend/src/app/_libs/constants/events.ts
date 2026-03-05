/**
 * Analytics event definitions for HealOps.
 * Used by PostHog (product analytics) and Google Analytics (marketing).
 */

// ─── PostHog Events (Product Analytics) ─────────────────────────────────────

export const POSTHOG_EVENTS = {
  // Onboarding
  ONBOARDING_STARTED: "onboarding_started",
  ONBOARDING_ORG_CREATED: "onboarding_org_created",
  ONBOARDING_CI_PROVIDER_CONFIGURED: "onboarding_ci_provider_configured",
  ONBOARDING_REPOS_SELECTED: "onboarding_repos_selected",
  ONBOARDING_AI_CONFIGURED: "onboarding_ai_configured",
  ONBOARDING_COMPLETED: "onboarding_completed",

  // CI Provider Management
  CI_PROVIDER_ADDED: "ci_provider_added",
  CI_PROVIDER_REMOVED: "ci_provider_removed",
  CI_PROVIDER_TOGGLED: "ci_provider_toggled",

  // Fix Agent
  FIX_DETAILS_VIEWED: "fix_details_viewed",
  FIX_PR_CLICKED: "fix_pr_clicked",
  FIX_FEEDBACK_SUBMITTED: "fix_feedback_submitted",

  // Navigation
  PAGE_VIEWED: "page_viewed",
  DASHBOARD_VIEWED: "dashboard_viewed",
  PROJECTS_VIEWED: "projects_viewed",
  COMMITS_VIEWED: "commits_viewed",
  SETTINGS_VIEWED: "settings_viewed",

  // Billing
  PRICING_VIEWED: "pricing_viewed",
  PLAN_SELECTED: "plan_selected",
  CHECKOUT_STARTED: "checkout_started",

  // Auth
  USER_SIGNED_UP: "user_signed_up",
  USER_LOGGED_IN: "user_logged_in",
  USER_LOGGED_OUT: "user_logged_out",

  // Beta / Waitlist
  BETA_SIGNUP_SUBMITTED: "beta_signup_submitted",

  // Engagement
  SEARCH_USED: "search_used",
  REPO_EXPANDED: "repo_expanded",
  BRANCH_CLICKED: "branch_clicked",
} as const;

// ─── Google Analytics Events (Marketing) ────────────────────────────────────

export const GOOGLE_ANALYTICS_EVENTS = {
  LANDING_PAGE_VIEW: "landing_page_view",
  PRICING_PAGE_VIEW: "pricing_page_view",
  CTA_CLICKED: "cta_clicked",
  SIGNUP_STARTED: "signup_started",
  SIGNUP_COMPLETED: "signup_completed",
  PLAN_COMPARED: "plan_compared",
} as const;
