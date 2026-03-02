import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({
    description: 'The plan slug to subscribe to (e.g. pro, enterprise)',
    example: 'pro',
  })
  @IsString({ message: 'Plan slug must be a string' })
  @IsNotEmpty({ message: 'Plan slug is required' })
  @MaxLength(100, { message: 'Plan slug must not exceed 100 characters' })
  planSlug!: string;

  @ApiProperty({
    description: 'URL to redirect to after successful checkout',
    example: 'https://app.healops.dev/billing?success=true',
  })
  @IsUrl({}, { message: 'Success URL must be a valid URL' })
  @IsNotEmpty({ message: 'Success URL is required' })
  successUrl!: string;

  @ApiProperty({
    description: 'URL to redirect to if the user cancels checkout',
    example: 'https://app.healops.dev/billing?canceled=true',
  })
  @IsUrl({}, { message: 'Cancel URL must be a valid URL' })
  @IsNotEmpty({ message: 'Cancel URL is required' })
  cancelUrl!: string;
}
