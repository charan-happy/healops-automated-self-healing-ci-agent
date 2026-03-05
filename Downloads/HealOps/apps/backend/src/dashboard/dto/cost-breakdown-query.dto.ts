import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CostBreakdownQueryDto {
  @ApiPropertyOptional({
    description: 'Organization ID to filter cost breakdown',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  organizationId?: string;
}
