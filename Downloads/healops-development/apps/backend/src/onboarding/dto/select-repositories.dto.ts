import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RepositorySelectionDto {
  @ApiProperty({
    description: 'External repository ID from the CI provider',
    example: '123456',
  })
  @IsString()
  externalRepoId!: string;

  @ApiProperty({
    description: 'Repository name (owner/repo format)',
    example: 'acme-corp/my-app',
  })
  @IsString()
  name!: string;

  @ApiPropertyOptional({
    description: 'Default branch name',
    example: 'main',
  })
  @IsOptional()
  @IsString()
  defaultBranch?: string;
}

export class SelectRepositoriesDto {
  @ApiProperty({
    description: 'List of repositories to enable for HealOps',
    type: [RepositorySelectionDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RepositorySelectionDto)
  repositories!: RepositorySelectionDto[];
}
