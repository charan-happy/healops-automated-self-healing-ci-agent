import {
  Controller,
  Get,
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
