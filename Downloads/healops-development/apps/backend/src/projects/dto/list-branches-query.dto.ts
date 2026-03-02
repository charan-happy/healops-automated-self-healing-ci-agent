import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class ListBranchesQueryDto {
  @ApiPropertyOptional({
    description: 'Sync branches from GitHub before returning (default: true)',
    default: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  sync?: boolean;

  @ApiPropertyOptional({ description: 'Search filter for branch name' })
  @IsOptional()
  @IsString()
  search?: string;
}
