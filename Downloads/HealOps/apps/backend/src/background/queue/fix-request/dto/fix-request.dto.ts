import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

/** Payload for POST /v1/healops/fix-request — report an error and get an AI fix via queue. */
export class FixRequestDto {
  @ApiProperty({ description: 'Error message from the API/runtime', example: "Cannot find module './auth.guard'" })
  @IsString()
  @MaxLength(8000)
  errorMessage!: string;

  @ApiProperty({ description: 'Code snippet where the error occurs', example: "import { AuthGuard } from './auth.guard';" })
  @IsString()
  @MaxLength(50000)
  codeSnippet!: string;

  @ApiProperty({ description: 'Line number where error was reported', example: 14 })
  @IsNumber()
  lineNumber!: number;

  @ApiProperty({ description: 'Git branch name', example: 'feat/user-auth' })
  @IsString()
  @MaxLength(255)
  branch!: string;

  @ApiProperty({ description: 'Git commit SHA', example: 'a1b2c3d4e5f6' })
  @IsString()
  @MaxLength(40)
  commitSha!: string;

  @ApiPropertyOptional({ description: 'File path (e.g. src/user.controller.ts)', example: 'src/user.controller.ts' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  filePath?: string;

  @ApiPropertyOptional({ description: 'Programming language', example: 'typescript' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  language?: string;
}
