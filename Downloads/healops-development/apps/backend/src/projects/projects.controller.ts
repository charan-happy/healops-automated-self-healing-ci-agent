// ─── Projects Controller ────────────────────────────────────────────────────
// Lists repositories, branches (with optional GitHub sync), and paginated commits
// for the authenticated user's organization.

import {
  Controller,
  Get,
  Param,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RouteNames } from '@common/route-names';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AuthUser } from '@auth/interfaces/auth-user.interface';
import { MembershipRepository } from '@db/repositories/healops/membership.repository';
import { ProjectsService } from './projects.service';

@Controller({ path: RouteNames.HEALOPS_PROJECTS, version: '1' })
@ApiTags('Projects')
export class ProjectsController {
  constructor(
    private readonly service: ProjectsService,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List repositories with branch count for the user\'s org' })
  @ApiResponse({ status: 200, description: 'Returns array of repositories with branch counts' })
  async listRepos(@CurrentUser() user: AuthUser) {
    const orgId = await this.resolveOrganizationId(user.id);
    return this.service.listRepos(orgId);
  }

  @Get(':repositoryId/branches')
  @ApiOperation({ summary: 'List branches for a repository (optional sync from GitHub)' })
  @ApiResponse({ status: 200, description: 'Returns array of branches' })
  async listBranches(
    @CurrentUser() user: AuthUser,
    @Param('repositoryId') repositoryId: string,
    @Query('sync') sync?: string,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    const shouldSync = sync === 'true';
    return this.service.listBranches(orgId, repositoryId, shouldSync);
  }

  @Get(':repositoryId/branches/:branchId/commits')
  @ApiOperation({ summary: 'List paginated commits for a branch' })
  @ApiResponse({ status: 200, description: 'Returns paginated array of commits' })
  async listCommits(
    @CurrentUser() user: AuthUser,
    @Param('repositoryId') repositoryId: string,
    @Param('branchId') branchId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const orgId = await this.resolveOrganizationId(user.id);
    const parsedLimit = limit ? parseInt(limit, 10) : 20;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.service.listCommits(orgId, repositoryId, branchId, parsedLimit, parsedOffset);
  }

  private async resolveOrganizationId(userId: string): Promise<string> {
    const memberships =
      await this.membershipRepository.findOrganizationsByUser(userId);
    const membership = memberships[0];
    if (!membership) {
      throw new BadRequestException(
        'No organization found. Please create an organization first.',
      );
    }
    return membership.organizationId;
  }
}
