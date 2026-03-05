import { getOctokit } from "./github-client";
import type { Project, Branch, Commit } from "../mockData";

export interface CommitFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
}

export interface CommitDetail {
  sha: string;
  message: string;
  author: string;
  date: string;
  stats: { additions: number; deletions: number; total: number };
  files: CommitFile[];
  parents: string[];
  htmlUrl: string;
}

export async function fetchRepos(): Promise<Project[]> {
  const octokit = await getOctokit();

  const { data } =
    await octokit.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });

  const HIDDEN_REPOS = new Set([
    "hello-coco",
    "parkash-gears",
    "hedge-architect",
    "lovable-ui",
    "parkash-gear-calc",
    "pipeline-guardian",
  ]);

  const sorted = [...data.repositories]
    .filter((repo) => !HIDDEN_REPOS.has(repo.name))
    .sort((a, b) => {
    const dateA = a.pushed_at ? new Date(a.pushed_at).getTime() : 0;
    const dateB = b.pushed_at ? new Date(b.pushed_at).getTime() : 0;
    return dateB - dateA;
  });

  return sorted.map((repo) => ({
    id: repo.full_name.replace("/", "--"),
    name: repo.name,
    repo: repo.full_name,
    branchCount: 0,
    lastActivity: repo.pushed_at
      ? formatRelativeTime(new Date(repo.pushed_at))
      : "unknown",
  }));
}

export async function fetchBranches(
  owner: string,
  repo: string,
): Promise<Branch[]> {
  const octokit = await getOctokit();

  const { data: branchesData } = await octokit.rest.repos.listBranches({
    owner,
    repo,
    per_page: 100,
  });

  const enriched = await Promise.all(
    branchesData.map(async (branch) => {
      const { data: commits, headers } = await octokit.rest.repos.listCommits({
        owner,
        repo,
        sha: branch.name,
        per_page: 1,
      });

      let commitCount = commits.length;
      const linkHeader = headers.link;
      if (linkHeader) {
        const match = linkHeader.match(/page=(\d+)>; rel="last"/);
        if (match) commitCount = parseInt(match[1], 10);
      }

      const latestCommit = commits[0];
      const commitDate = latestCommit?.commit?.author?.date
        ? new Date(latestCommit.commit.author.date)
        : null;

      return {
        branch: {
          id: branch.name,
          name: branch.name,
          author: latestCommit?.commit?.author?.name ?? "",
          commitCount,
          lastCommit: commitDate ? formatRelativeTime(commitDate) : "",
          pipelineStatus: "pending" as const,
        },
        sortDate: commitDate?.getTime() ?? 0,
      };
    }),
  );

  enriched.sort((a, b) => b.sortDate - a.sortDate);
  return enriched.map((e) => e.branch);
}

export async function fetchCommits(
  owner: string,
  repo: string,
  branch: string,
): Promise<Commit[]> {
  const octokit = await getOctokit();

  const { data } = await octokit.rest.repos.listCommits({
    owner,
    repo,
    sha: branch,
    per_page: 30,
  });

  return data.map((commit) => ({
    id: commit.sha,
    sha: commit.sha.slice(0, 7),
    message: commit.commit.message.split("\n")[0],
    author: commit.commit.author?.name ?? commit.author?.login ?? "unknown",
    timestamp: commit.commit.author?.date
      ? new Date(commit.commit.author.date).toLocaleString()
      : "",
    pipelineStatus: "pending" as const,
    agentFixCount: 0,
  }));
}

export async function fetchCommitDetail(
  owner: string,
  repo: string,
  sha: string,
): Promise<CommitDetail> {
  const octokit = await getOctokit();

  const { data } = await octokit.rest.repos.getCommit({
    owner,
    repo,
    ref: sha,
  });

  return {
    sha: data.sha,
    message: data.commit.message,
    author: data.commit.author?.name ?? data.author?.login ?? "unknown",
    date: data.commit.author?.date
      ? new Date(data.commit.author.date).toLocaleString()
      : "",
    stats: {
      additions: data.stats?.additions ?? 0,
      deletions: data.stats?.deletions ?? 0,
      total: data.stats?.total ?? 0,
    },
    files: (data.files ?? []).map((f) => ({
      filename: f.filename!,
      status: f.status!,
      additions: f.additions!,
      deletions: f.deletions!,
      patch: f.patch,
    })),
    parents: data.parents.map((p) => p.sha.slice(0, 7)),
    htmlUrl: data.html_url,
  };
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}
