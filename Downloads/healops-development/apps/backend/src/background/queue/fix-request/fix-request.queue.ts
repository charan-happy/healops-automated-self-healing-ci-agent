import { JobName, QueueName } from '@bg/constants/job.constant';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

export interface FixRequestPayload {
  errorMessage: string;
  codeSnippet: string;
  lineNumber: number;
  branch: string;
  commitSha: string;
  filePath?: string;
  language?: string;
}

export interface BatchFixRequestPayload {
  buildErrors: FixRequestPayload[];
  branch: string;
  commitSha: string;
  pipelineRunId: string;
  repositoryId: string;
  organizationId: string;
  scmProvider: string; // 'github' | 'gitlab'
  scmConnectionConfig: {
    owner: string;
    repo: string;
    authToken: string;
    serverUrl?: string;
  };
  // Backward compat (optional — used by legacy GitHub-only flow)
  githubInstallationId?: string;
  owner?: string;
  repo?: string;
}

@Injectable()
export class FixRequestQueue {
  constructor(@InjectQueue(QueueName.HEALOPS_FIX_REQUEST) private readonly queue: Queue) {}

  async addFixRequest(payload: FixRequestPayload): Promise<{ jobId: string }> {
    const job = await this.queue.add(JobName.FIX_REQUEST, payload, {
      // Retries are handled internally by RepairAgentService (max 3 fix attempts).
      // BullMQ retry is only for infrastructure failures (network, OOM).
      attempts: 1,
    });
    return { jobId: String(job.id) };
  }

  async addBatchFixRequest(payload: BatchFixRequestPayload): Promise<{ jobId: string }> {
    const job = await this.queue.add(JobName.BATCH_FIX_REQUEST, payload, {
      attempts: 1,
    });
    return { jobId: String(job.id) };
  }
}
