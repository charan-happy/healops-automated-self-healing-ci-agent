export type PipelineStatus = "success" | "failed" | "running" | "pending" | "fixed" | "escalated";

export interface Project {
  id: string;
  name: string;
  repo: string;
  branchCount: number;
  defaultBranch?: string;
  lastActivity: string;
  /** CI provider: github, gitlab, bitbucket, jenkins */
  provider?: string;
}

export interface Branch {
  id: string;
  name: string;
  author: string;
  commitCount: number;
  lastCommit: string;
  pipelineStatus: PipelineStatus;
  prUrl?: string;
  prStatus?: "open" | "merged" | "declined";
}

export interface Commit {
  id: string;
  sha: string;
  message: string;
  author: string;
  timestamp: string;
  pipelineStatus: PipelineStatus;
  agentFixCount: number;
}

export interface AgentFix {
  id: string;
  attempt: number;
  status: PipelineStatus;
  timestamp: string;
  error: string;
  fix: string;
  originalCode: string;
  fixedCode: string;
  filePath: string;
  prUrl?: string;
  duration: string;
}

export const mockProjects: Project[] = [
  { id: "1", name: "frontend-app", repo: "acme/frontend-app", branchCount: 12, lastActivity: "2 min ago" },
  { id: "2", name: "api-gateway", repo: "acme/api-gateway", branchCount: 8, lastActivity: "15 min ago" },
  { id: "3", name: "auth-service", repo: "acme/auth-service", branchCount: 5, lastActivity: "1 hour ago" },
  { id: "4", name: "data-pipeline", repo: "acme/data-pipeline", branchCount: 3, lastActivity: "3 hours ago" },
];

export const mockBranches: Record<string, Branch[]> = {
  "1": [
    { id: "b1", name: "feature/user-dashboard", author: "alice", commitCount: 7, lastCommit: "2 min ago", pipelineStatus: "fixed", prUrl: "https://github.com/acme/frontend-app/pull/142", prStatus: "open" },
    { id: "b2", name: "feature/settings-page", author: "bob", commitCount: 3, lastCommit: "1 hour ago", pipelineStatus: "escalated", prUrl: "https://github.com/acme/frontend-app/pull/145", prStatus: "open" },
    { id: "b3", name: "fix/login-redirect", author: "alice", commitCount: 2, lastCommit: "3 hours ago", pipelineStatus: "success", prUrl: "https://github.com/acme/frontend-app/pull/138", prStatus: "merged" },
    { id: "b4", name: "feature/notifications", author: "charlie", commitCount: 5, lastCommit: "5 hours ago", pipelineStatus: "running" },
  ],
  "2": [
    { id: "b5", name: "feature/rate-limiting", author: "dave", commitCount: 4, lastCommit: "15 min ago", pipelineStatus: "failed", prUrl: "https://github.com/acme/api-gateway/pull/89", prStatus: "open" },
    { id: "b6", name: "fix/cors-headers", author: "eve", commitCount: 1, lastCommit: "2 hours ago", pipelineStatus: "success", prUrl: "https://github.com/acme/api-gateway/pull/87", prStatus: "merged" },
  ],
  "3": [
    { id: "b7", name: "feature/oauth-google", author: "frank", commitCount: 6, lastCommit: "1 hour ago", pipelineStatus: "fixed", prUrl: "https://github.com/acme/auth-service/pull/56", prStatus: "open" },
  ],
  "4": [
    { id: "b8", name: "feature/etl-refactor", author: "grace", commitCount: 9, lastCommit: "3 hours ago", pipelineStatus: "pending" },
  ],
};

export const mockCommits: Record<string, Commit[]> = {
  "b1": [
    { id: "c1", sha: "a3f8d2e", message: "Add dashboard layout components", author: "alice", timestamp: "2025-02-26 14:32", pipelineStatus: "fixed", agentFixCount: 2 },
    { id: "c2", sha: "b7c1e9a", message: "Integrate chart library for metrics", author: "alice", timestamp: "2025-02-26 13:15", pipelineStatus: "success", agentFixCount: 0 },
    { id: "c3", sha: "d4f6b8c", message: "Add user stats API endpoint", author: "alice", timestamp: "2025-02-26 11:42", pipelineStatus: "fixed", agentFixCount: 1 },
  ],
  "b2": [
    { id: "c4", sha: "e2a9f1d", message: "WIP: Settings form validation", author: "bob", timestamp: "2025-02-26 13:00", pipelineStatus: "escalated", agentFixCount: 3 },
    { id: "c5", sha: "f8b3c7e", message: "Add settings page route", author: "bob", timestamp: "2025-02-26 10:30", pipelineStatus: "success", agentFixCount: 0 },
  ],
  "b4": [
    { id: "c6", sha: "g1h2i3j", message: "Add notification service integration", author: "charlie", timestamp: "2025-02-26 09:00", pipelineStatus: "running", agentFixCount: 1 },
    { id: "c7", sha: "k4l5m6n", message: "Setup notification models", author: "charlie", timestamp: "2025-02-25 17:30", pipelineStatus: "success", agentFixCount: 0 },
  ],
};

export const mockAgentFixes: Record<string, AgentFix[]> = {
  "c1": [
    {
      id: "f1",
      attempt: 1,
      status: "failed",
      timestamp: "2025-02-26 14:35",
      error: "TypeError: Cannot read properties of undefined (reading 'map')\n  at DashboardGrid (src/components/DashboardGrid.tsx:24:18)\n  at renderWithHooks (node_modules/react-dom/...)",
      fix: "Added null check before mapping over metrics array. The API response can return undefined when no data exists for the time range.",
      originalCode: `const DashboardGrid = ({ metrics }) => {
  return (
    <div className="grid">
      {metrics.map((m) => (
        <MetricCard key={m.id} {...m} />
      ))}
    </div>
  );
};`,
      fixedCode: `const DashboardGrid = ({ metrics }) => {
  return (
    <div className="grid">
      {(metrics ?? []).map((m) => (
        <MetricCard key={m.id} {...m} />
      ))}
    </div>
  );
};`,
      filePath: "src/components/DashboardGrid.tsx",
      duration: "45s",
    },
    {
      id: "f2",
      attempt: 2,
      status: "success",
      timestamp: "2025-02-26 14:38",
      error: "ESLint: 'MetricCard' is not defined (no-undef)\n  at src/components/DashboardGrid.tsx:5:10",
      fix: "Added missing import for MetricCard component.",
      originalCode: `// No import statement for MetricCard
const DashboardGrid = ({ metrics }) => {`,
      fixedCode: `import { MetricCard } from './MetricCard';

const DashboardGrid = ({ metrics }) => {`,
      filePath: "src/components/DashboardGrid.tsx",
      prUrl: "https://github.com/acme/frontend-app/pull/142",
      duration: "32s",
    },
  ],
  "c3": [
    {
      id: "f3",
      attempt: 1,
      status: "success",
      timestamp: "2025-02-26 11:48",
      error: "Build Error: Module not found: Can't resolve './utils/formatDate'\n  at src/api/userStats.ts:3:1",
      fix: "Fixed import path — the utility was moved to a shared directory in a previous refactor.",
      originalCode: `import { formatDate } from './utils/formatDate';`,
      fixedCode: `import { formatDate } from '@/shared/utils/formatDate';`,
      filePath: "src/api/userStats.ts",
      prUrl: "https://github.com/acme/frontend-app/pull/139",
      duration: "28s",
    },
  ],
  "c4": [
    {
      id: "f4",
      attempt: 1,
      status: "failed",
      timestamp: "2025-02-26 13:05",
      error: "Test Failed: SettingsForm › should validate email format\n  Expected: true\n  Received: false\n  at src/components/SettingsForm.test.tsx:42",
      fix: "Updated email regex to properly handle edge cases with plus signs and subdomains.",
      originalCode: `const emailRegex = /^[a-zA-Z0-9]+@[a-zA-Z0-9]+\\.[a-zA-Z]{2,}$/;`,
      fixedCode: `const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/;`,
      filePath: "src/utils/validation.ts",
      duration: "52s",
    },
    {
      id: "f5",
      attempt: 2,
      status: "failed",
      timestamp: "2025-02-26 13:12",
      error: "TypeScript Error: Property 'phoneNumber' does not exist on type 'SettingsFormData'\n  at src/components/SettingsForm.tsx:18:25",
      fix: "Added phoneNumber field to SettingsFormData interface.",
      originalCode: `interface SettingsFormData {
  email: string;
  name: string;
}`,
      fixedCode: `interface SettingsFormData {
  email: string;
  name: string;
  phoneNumber?: string;
}`,
      filePath: "src/types/settings.ts",
      duration: "38s",
    },
    {
      id: "f6",
      attempt: 3,
      status: "failed",
      timestamp: "2025-02-26 13:20",
      error: "CI Error: E2E test timeout after 30000ms\n  at cypress/e2e/settings.cy.ts:15:5\n  Timed out waiting for element: [data-testid='save-btn']",
      fix: "Increased timeout and added proper wait for form submission to complete before asserting.",
      originalCode: `cy.get('[data-testid="save-btn"]').click();
cy.contains('Settings saved');`,
      fixedCode: `cy.get('[data-testid="save-btn"]', { timeout: 10000 }).click();
cy.contains('Settings saved', { timeout: 15000 }).should('be.visible');`,
      filePath: "cypress/e2e/settings.cy.ts",
      duration: "1m 15s",
    },
  ],
  "c6": [
    {
      id: "f7",
      attempt: 1,
      status: "running",
      timestamp: "2025-02-26 09:05",
      error: "Build Error: Cannot find module '@/services/notifications'\n  at src/controllers/notify.ts:2:1",
      fix: "Attempting to create missing notification service module...",
      originalCode: `import { NotificationService } from '@/services/notifications';`,
      fixedCode: `// Fix in progress...`,
      filePath: "src/controllers/notify.ts",
      duration: "running...",
    },
  ],
};
