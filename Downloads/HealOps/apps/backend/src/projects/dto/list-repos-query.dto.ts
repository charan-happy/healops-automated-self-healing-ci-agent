import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ListReposQueryDto {
  @ApiPropertyOptional({ description: 'Search filter for project name' })
  @IsOptional()
  @IsString()
  search?: string;
}
