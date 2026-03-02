import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsIn } from 'class-validator';

export class ConfigureLlmDto {
  @ApiProperty({
    description: 'LLM provider to use for AI-powered repairs',
    enum: ['claude', 'openai', 'openrouter', 'local'],
    example: 'claude',
  })
  @IsIn(['claude', 'openai', 'openrouter', 'local'], {
    message: 'Provider must be one of: claude, openai, openrouter, local',
  })
  provider!: string;

  @ApiPropertyOptional({
    description: 'API key for the LLM provider',
    example: 'sk-ant-xxxxxxxxxxxx',
  })
  @IsOptional()
  @IsString()
  apiKey?: string;

  @ApiPropertyOptional({
    description: 'Base URL for custom or self-hosted LLM endpoints',
    example: 'https://api.openai.com/v1',
  })
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiPropertyOptional({
    description: 'Model name/ID to use',
    example: 'claude-sonnet-4-20250514',
  })
  @IsOptional()
  @IsString()
  model?: string;
}
