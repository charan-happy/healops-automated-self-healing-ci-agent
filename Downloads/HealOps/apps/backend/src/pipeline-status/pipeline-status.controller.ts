import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RouteNames } from '@common/route-names';
import { Public } from '@auth/decorators/public.decorator';
import { PipelineStatusService } from './pipeline-status.service';

@Controller({ path: RouteNames.HEALOPS_PIPELINE_STATUS, version: '1' })
@ApiTags('HealOps Pipeline Status')
@Public()
export class PipelineStatusController {
  constructor(private readonly pipelineStatusService: PipelineStatusService) {}

  @Get(':commitSha')
  @ApiOperation({
    summary: 'Get pipeline status by commit SHA',
    description:
      'Returns pipeline run status, failures, repair jobs, attempts, patches, and PR info for a given commit SHA.',
  })
  @ApiParam({
    name: 'commitSha',
    type: String,
    description: 'Git commit SHA (full 40-char or short)',
  })
  @ApiResponse({ status: 200, description: 'Pipeline status for the commit' })
  @ApiResponse({ status: 404, description: 'No pipeline runs found for this commit' })
  async getStatus(@Param('commitSha') commitSha: string) {
    const result = await this.pipelineStatusService.getStatusByCommitSha(commitSha);

    if (!result) {
      throw new NotFoundException(
        `No pipeline runs found for commit ${commitSha}`,
      );
    }

    return result;
  }
}
