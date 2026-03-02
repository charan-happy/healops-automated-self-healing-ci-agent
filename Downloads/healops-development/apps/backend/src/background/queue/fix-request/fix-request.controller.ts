// ─── Fix Request Controller ─────────────────────────────────────────────────
// TESTING & DEBUGGING PATHWAY — not the primary HealOps pipeline.
//
// This is a manual API endpoint for developers to test the repair agent
// without triggering a real GitHub webhook. Useful for:
// - Testing fix generation on arbitrary error messages during development
// - Verifying the repair pipeline works end-to-end before connecting to CI
// - Running the agent on errors from external systems
//
// For the production self-healing flow, GitHub webhook events are processed
// by GithubWebhookService → RepairJobsService → RepairQueueProcessor →
// RepairAgentService.runRepair(), which also pushes branches, creates PRs,
// and handles escalation. This API pathway only generates fixes — it does
// NOT push code or create PRs.

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RouteNames } from '@common/route-names';
import { Public } from '@auth/decorators/public.decorator';
import { FixRequestDto } from './dto/fix-request.dto';
import { FixRequestQueue } from './fix-request.queue';

@Controller({ path: RouteNames.HEALOPS_FIX_REQUEST, version: '1' })
@ApiTags('HealOps Fix Request')
@Public()
export class FixRequestController {
  constructor(private readonly fixRequestQueue: FixRequestQueue) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Report an error and queue an AI fix',
    description:
      'Sends error details (message, code, line, file, branch, commit) to the fix-request queue. ' +
      'The worker classifies the error, checks scope, searches for similar past fixes, ' +
      'and generates a fix with up to 3 retry attempts. Results are persisted in the database.',
  })
  @ApiBody({ type: FixRequestDto })
  @ApiResponse({
    status: 202,
    description: 'Job queued',
    schema: {
      properties: {
        jobId: { type: 'string' },
        message: { type: 'string' },
      },
    },
  })
  async fixRequest(
    @Body() dto: FixRequestDto,
  ): Promise<{ jobId: string; message: string }> {
    const payload = {
      errorMessage: dto.errorMessage,
      codeSnippet: dto.codeSnippet,
      lineNumber: dto.lineNumber,
      branch: dto.branch,
      commitSha: dto.commitSha,
      ...(dto.filePath !== undefined && { filePath: dto.filePath }),
      ...(dto.language !== undefined && { language: dto.language }),
    };

    const { jobId } = await this.fixRequestQueue.addFixRequest(payload);
    return {
      jobId,
      message:
        'Fix request queued. The AI agent will classify, search for similar fixes, and attempt resolution (up to 3 retries). Check Bull Board (admin/queues) or the database for results.',
    };
  }
}
