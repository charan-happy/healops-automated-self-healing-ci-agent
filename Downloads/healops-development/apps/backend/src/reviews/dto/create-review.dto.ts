import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEmail,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ description: 'Reviewer name', example: 'Jane Doe' })
  @IsString()
  @IsNotEmpty({ message: 'Name is required' })
  @MaxLength(100)
  userName!: string;

  @ApiPropertyOptional({
    description: 'Reviewer email (not displayed publicly)',
    example: 'jane@company.com',
  })
  @IsOptional()
  @IsEmail()
  userEmail?: string;

  @ApiPropertyOptional({
    description: 'Role or job title',
    example: 'DevOps Engineer',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  userRole?: string;

  @ApiPropertyOptional({
    description: 'Company name',
    example: 'Acme Corp',
  })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  userCompany?: string;

  @ApiProperty({
    description: 'Rating from 1 to 5',
    example: 5,
    minimum: 1,
    maximum: 5,
  })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiProperty({
    description: 'Review headline',
    example: 'Saved our team hours every week',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: 'Full review text',
    example: 'HealOps caught a flaky test we missed for months...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  comment!: string;
}
