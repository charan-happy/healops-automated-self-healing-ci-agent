import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';

export class ConfigureCiProviderDto {
  @ApiProperty({
    description: 'CI/CD provider type',
    enum: ['github', 'gitlab', 'jenkins', 'bitbucket'],
    example: 'github',
  })
  @IsIn(['github', 'gitlab', 'jenkins', 'bitbucket'], {
    message: 'Provider must be one of: github, gitlab, jenkins, bitbucket',
  })
  provider!: string;

  @ApiPropertyOptional({
    description: 'GitHub App installation ID (for GitHub provider)',
    example: '12345678',
  })
  @IsOptional()
  @IsString()
  githubInstallationId?: string;

  @ApiPropertyOptional({
    description: 'Access token for the CI provider (for GitLab/Jenkins/Bitbucket)',
    example: 'glpat-xxxxxxxxxxxxxxxxxxxx',
  })
  @IsOptional()
  @IsString()
  accessToken?: string;

  @ApiPropertyOptional({
    description: 'API token (alias for accessToken, used by Jenkins)',
    example: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  })
  @IsOptional()
  @IsString()
  apiToken?: string;

  @ApiPropertyOptional({
    description: 'Username for the CI provider (required for Jenkins)',
    example: 'admin',
  })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({
    description: 'App password for Bitbucket',
    example: 'ATBBxxxxxxxx',
  })
  @IsOptional()
  @IsString()
  appPassword?: string;

  @ApiPropertyOptional({
    description: 'Workspace slug for Bitbucket',
    example: 'my-workspace',
  })
  @IsOptional()
  @IsString()
  workspace?: string;

  @ApiPropertyOptional({
    description: 'Server URL for self-hosted instances (e.g., GitLab CE/EE, Jenkins)',
    example: 'https://gitlab.example.com',
  })
  @IsOptional()
  @IsString()
  serverUrl?: string;

  @ApiPropertyOptional({
    description: 'Source code platform when CI provider differs from SCM (e.g., Jenkins CI with GitHub SCM)',
    enum: ['github', 'gitlab', 'bitbucket'],
    example: 'github',
  })
  @IsOptional()
  @IsIn(['github', 'gitlab', 'bitbucket'], {
    message: 'scmProvider must be one of: github, gitlab, bitbucket',
  })
  scmProvider?: string;
}
