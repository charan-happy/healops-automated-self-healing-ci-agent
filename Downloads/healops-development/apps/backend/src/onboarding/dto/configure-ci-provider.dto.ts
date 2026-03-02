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
    description: 'Server URL for self-hosted instances (e.g., GitLab CE/EE, Jenkins)',
    example: 'https://gitlab.example.com',
  })
  @IsOptional()
  @IsString()
  serverUrl?: string;
}
