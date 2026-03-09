import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RouteNames } from '@common/route-names';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AuthUser } from '@auth/interfaces/auth-user.interface';
import { MembershipRepository } from '@db/repositories/healops/membership.repository';
import { ProjectsService } from './projects.service';
import { ListReposQueryDto } from './dto/list-repos-query.dto';
import { ListBranchesQueryDto } from './dto/list-branches-query.dto';
import { ListCommitsQueryDto } from './dto/list-commits-query.dto';

interface AddRepositoriesDto {
  providerConfigId: string;
  providerType: 'ci' | 'scm';
  repositories: Array<{
    externalRepoId: string;
    name: string;
    defaultBranch?: string;
  }>;
}

@Controller({ path: RouteNames.HEALOPS_PROJECTS, version: '1' })
@ApiTags('Projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List repositories with branch counts' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns repositories for the user\'s organization',
  })
  async listRepos(
    @CurrentUser() user: AuthUser,
    @Query() _query: ListReposQueryDto,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.projectsService.listRepositories(orgId);
  }

  @Get(':repositoryId/branches')
  @ApiOperation({ summary: 'List branches for a repository' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns branches with commit counts',
  })
  async listBranches(
    @CurrentUser() user: AuthUser,
    @Param('repositoryId') repositoryId: string,
    @Query() query: ListBranchesQueryDto,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.projectsService.listBranches(
      repositoryId,
      orgId,
      query.sync !== false,
    );
  }

  @Get(':repositoryId/branches/:branchId/commits')
  @ApiOperation({ summary: 'List commits for a branch' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns commits ordered by date',
  })
  async listCommits(
    @CurrentUser() user: AuthUser,
    @Param('repositoryId') repositoryId: string,
    @Param('branchId') branchId: string,
    @Query() query: ListCommitsQueryDto,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.projectsService.listCommits(
      repositoryId,
      branchId,
      orgId,
      query.limit ?? 30,
      query.offset ?? 0,
    );
  }

  @Post('repositories')
  @ApiOperation({ summary: 'Add repositories from a connected provider' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Repositories added' })
  async addRepositories(
    @CurrentUser() user: AuthUser,
    @Body() dto: AddRepositoriesDto,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    if (!dto.providerConfigId || !dto.repositories?.length) {
      throw new BadRequestException('providerConfigId and repositories are required');
    }
    return this.projectsService.addRepositories(
      orgId,
      dto.providerConfigId,
      dto.providerType,
      dto.repositories,
    );
  }

  @Get(':repositoryId/pipelines')
  @ApiOperation({ summary: 'List recent pipeline runs for a repository' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Returns recent CI pipeline runs' })
  async listPipelines(
    @CurrentUser() user: AuthUser,
    @Param('repositoryId') repositoryId: string,
    @Query('limit') limit?: string,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.projectsService.listPipelineRuns(
      repositoryId,
      orgId,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  // ─── Commit Detail ─────────────────────────────────────────────────────

  @Get(':repositoryId/commits/:commitSha/detail')
  @ApiOperation({ summary: 'Get commit detail (diff, files, stats) from SCM provider' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Returns commit detail' })
  async getCommitDetail(
    @CurrentUser() user: AuthUser,
    @Param('repositoryId') repositoryId: string,
    @Param('commitSha') commitSha: string,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.projectsService.getCommitDetail(repositoryId, orgId, commitSha);
  }

  // ─── CI Provider Jobs (auto-fetch) ─────────────────────────────────────

  @Get('ci-providers/:configId/jobs')
  @ApiOperation({ summary: 'List available jobs/pipelines from a CI provider' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Returns available jobs' })
  async listCiProviderJobs(
    @CurrentUser() user: AuthUser,
    @Param('configId') configId: string,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.projectsService.listCiProviderJobs(configId, orgId);
  }

  // ─── CI Provider Links ──────────────────────────────────────────────────

  @Get(':repositoryId/ci-links')
  @ApiOperation({ summary: 'List CI provider links for a repository' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Returns CI provider links' })
  async listCiLinks(
    @CurrentUser() user: AuthUser,
    @Param('repositoryId') repositoryId: string,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.projectsService.listCiLinks(repositoryId, orgId);
  }

  @Post(':repositoryId/ci-links')
  @ApiOperation({ summary: 'Link a CI provider to a repository' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'CI provider linked' })
  async addCiLink(
    @CurrentUser() user: AuthUser,
    @Param('repositoryId') repositoryId: string,
    @Body() body: { ciProviderConfigId: string; pipelineName?: string },
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    if (!body.ciProviderConfigId) {
      throw new BadRequestException('ciProviderConfigId is required');
    }
    return this.projectsService.addCiLink(
      repositoryId,
      orgId,
      body.ciProviderConfigId,
      body.pipelineName,
    );
  }

  @Patch(':repositoryId/ci-links/:linkId')
  @ApiOperation({ summary: 'Update a CI provider link' })
  @ApiResponse({ status: HttpStatus.OK, description: 'CI provider link updated' })
  async updateCiLink(
    @CurrentUser() user: AuthUser,
    @Param('repositoryId') repositoryId: string,
    @Param('linkId') linkId: string,
    @Body() body: { pipelineName?: string; isActive?: boolean },
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.projectsService.updateCiLink(repositoryId, orgId, linkId, body);
  }

  @Delete(':repositoryId/ci-links/:linkId')
  @ApiOperation({ summary: 'Remove a CI provider link' })
  @ApiResponse({ status: HttpStatus.OK, description: 'CI provider link removed' })
  async removeCiLink(
    @CurrentUser() user: AuthUser,
    @Param('repositoryId') repositoryId: string,
    @Param('linkId') linkId: string,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.projectsService.removeCiLink(repositoryId, orgId, linkId);
  }

  private async resolveOrganizationId(userId: string): Promise<string> {
    const memberships =
      await this.membershipRepository.findOrganizationsByUser(userId);
    const membership = memberships[0];
    if (!membership) {
      throw new BadRequestException(
        'No organization found. Please complete onboarding first.',
      );
    }
    return membership.organizationId;
  }
}
