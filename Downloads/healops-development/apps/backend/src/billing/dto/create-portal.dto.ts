import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUrl } from 'class-validator';

export class CreatePortalDto {
  @ApiProperty({
    description: 'URL to redirect the user back to after leaving the Stripe portal',
    example: 'https://app.healops.dev/billing',
  })
  @IsUrl({ require_tld: false }, { message: 'Return URL must be a valid URL' })
  @IsNotEmpty({ message: 'Return URL is required' })
  returnUrl!: string;
}
