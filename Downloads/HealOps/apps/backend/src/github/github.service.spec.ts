/* eslint-disable @typescript-eslint/no-unsafe-assignment */
jest.mock('@octokit/rest', () => ({
  Octokit: jest.fn(),
}));
jest.mock('@octokit/auth-app', () => ({
  createAppAuth: jest.fn(),
}));

import { GithubService } from './github.service';
import { GithubAppProvider } from './providers/github-app.provider';

describe('GithubService', () => {
  let service: GithubService;
  let mockOctokit: Record<string, Record<string, jest.Mock>>;
  let mockProvider: jest.Mocked<Pick<GithubAppProvider, 'getInstallationClient'>>;

  beforeEach(() => {
    mockOctokit = {
      repos: {
        getContent: jest.fn(),
      },
      git: {
        getTree: jest.fn(),
        createRef: jest.fn(),
        getRef: jest.fn(),
        getCommit: jest.fn(),
        createBlob: jest.fn(),
        createTree: jest.fn(),
        createCommit: jest.fn(),
        updateRef: jest.fn(),
      },
      pulls: {
        create: jest.fn(),
      },
      issues: {
        create: jest.fn(),
      },
      actions: {
        downloadWorkflowRunLogs: jest.fn(),
        listWorkflowRunsForRepo: jest.fn(),
      },
    };

    mockProvider = {
      getInstallationClient: jest.fn().mockResolvedValue(mockOctokit),
    };

    service = new GithubService(mockProvider as unknown as GithubAppProvider);
  });

  describe('getFileContent()', () => {
    it('should fetch and base64-decode file content', async () => {
      const content = Buffer.from('console.log("hello")').toString('base64');
      mockOctokit['repos']!['getContent']!.mockResolvedValue({
        data: { content },
      });

      const result = await service.getFileContent('inst-1', 'owner', 'repo', 'src/app.ts', 'main');
      expect(result).toBe('console.log("hello")');
    });

    it('should return null on 404', async () => {
      mockOctokit['repos']!['getContent']!.mockRejectedValue(new Error('Not Found'));
      const result = await service.getFileContent('inst-1', 'owner', 'repo', 'missing.ts', 'main');
      expect(result).toBeNull();
    });
  });

  describe('getRepoTree()', () => {
    it('should return file paths only (blobs)', async () => {
      mockOctokit['git']!['getTree']!.mockResolvedValue({
        data: {
          tree: [
            { path: 'src/app.ts', type: 'blob' },
            { path: 'src', type: 'tree' },
            { path: 'src/index.ts', type: 'blob' },
          ],
        },
      });

      const result = await service.getRepoTree('inst-1', 'owner', 'repo', 'abc123');
      expect(result).toEqual(['src/app.ts', 'src/index.ts']);
    });
  });

  describe('createBranch()', () => {
    it('should create a branch successfully', async () => {
      mockOctokit['git']!['createRef']!.mockResolvedValue({});
      const result = await service.createBranch('inst-1', 'owner', 'repo', 'fix/test', 'abc123');
      expect(result).toBe(true);
    });

    it('should handle "Reference already exists" gracefully', async () => {
      mockOctokit['git']!['createRef']!.mockRejectedValue(new Error('Reference already exists'));
      const result = await service.createBranch('inst-1', 'owner', 'repo', 'fix/test', 'abc123');
      expect(result).toBe(true);
    });
  });

  describe('createPR()', () => {
    it('should always create draft PRs', async () => {
      mockOctokit['pulls']!['create']!.mockResolvedValue({
        data: { number: 42, html_url: 'https://github.com/owner/repo/pull/42' },
      });

      const result = await service.createPR('inst-1', 'owner', 'repo', {
        title: 'Fix',
        body: 'Auto fix',
        head: 'fix/test',
        base: 'main',
      });

      expect(result).toEqual({ number: 42, url: 'https://github.com/owner/repo/pull/42' });
      expect(mockOctokit['pulls']!['create']).toHaveBeenCalledWith(
        expect.objectContaining({ draft: true }),
      );
    });
  });

  describe('createIssue()', () => {
    it('should create an issue with labels', async () => {
      mockOctokit['issues']!['create']!.mockResolvedValue({
        data: { number: 10, html_url: 'https://github.com/owner/repo/issues/10' },
      });

      const result = await service.createIssue('inst-1', 'owner', 'repo', {
        title: 'Escalation',
        body: 'Could not fix',
        labels: ['healops'],
      });

      expect(result).toEqual({ number: 10, url: 'https://github.com/owner/repo/issues/10' });
    });
  });

  describe('getLatestWorkflowStatus()', () => {
    it('should return the conclusion of the latest workflow run', async () => {
      mockOctokit['actions']!['listWorkflowRunsForRepo']!.mockResolvedValue({
        data: {
          workflow_runs: [{ conclusion: 'success', status: 'completed' }],
        },
      });

      const result = await service.getLatestWorkflowStatus('inst-1', 'owner', 'repo', 'main');
      expect(result).toBe('success');
    });

    it('should return null when no workflow runs exist', async () => {
      mockOctokit['actions']!['listWorkflowRunsForRepo']!.mockResolvedValue({
        data: { workflow_runs: [] },
      });

      const result = await service.getLatestWorkflowStatus('inst-1', 'owner', 'repo', 'main');
      expect(result).toBeNull();
    });
  });
});
