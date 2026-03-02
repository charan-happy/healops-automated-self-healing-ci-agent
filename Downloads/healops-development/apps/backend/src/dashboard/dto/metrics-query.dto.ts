import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsDateString } from 'class-validator';

export class MetricsQueryDto {
  @ApiPropertyOptional({
    description: 'Organization ID to filter metrics',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({
    description: 'Start date for the metrics range (ISO 8601)',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'End date for the metrics range (ISO 8601)',
    example: '2026-03-01',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
