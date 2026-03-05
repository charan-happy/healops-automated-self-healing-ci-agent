import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsUrl, MaxLength } from 'class-validator';

export class CreateOrganizationDto {
  @ApiProperty({
    description: 'Organization name',
    example: 'Acme Corp',
    maxLength: 255,
  })
  @IsString()
  @IsNotEmpty({ message: 'Organization name is required' })
  @MaxLength(255, { message: 'Organization name must not exceed 255 characters' })
  name!: string;

  @ApiPropertyOptional({
    description: 'Slack webhook URL for notifications',
    example: 'https://hooks.slack.com/services/T00/B00/xxx',
  })
  @IsOptional()
  @IsUrl({ require_tld: false }, { message: 'Please provide a valid URL' })
  slackWebhookUrl?: string;
}
