// ─── Reviews Controller ─────────────────────────────────────────────────────
// Public endpoints for submitting and viewing approved user reviews/testimonials.

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RouteNames } from '@common/route-names';
import { Public } from '../auth/decorators/public.decorator';
import { ReviewsService } from './reviews.service';

interface SubmitReviewDto {
  userName: string;
  userEmail?: string;
  userRole?: string;
  userCompany?: string;
  avatarUrl?: string;
  rating: number;
  title: string;
  comment: string;
}

@Controller({ path: RouteNames.HEALOPS_REVIEWS, version: '1' })
@ApiTags('Reviews')
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Submit a new review' })
  @ApiResponse({ status: 201, description: 'Review submitted (pending approval)' })
  async submitReview(@Body() dto: SubmitReviewDto) {
    if (!dto.userName?.trim() || !dto.title?.trim() || !dto.comment?.trim()) {
      throw new BadRequestException('userName, title, and comment are required');
    }
    if (!dto.rating || dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('rating must be between 1 and 5');
    }
    return this.service.submitReview(dto);
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get approved reviews (paginated)' })
  @ApiResponse({ status: 200, description: 'Returns paginated approved reviews' })
  async getApprovedReviews(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const parsedOffset = offset ? parseInt(offset, 10) : 0;
    return this.service.getApprovedReviews(parsedLimit, parsedOffset);
  }

  @Get('stats')
  @Public()
  @ApiOperation({ summary: 'Get aggregate review statistics' })
  @ApiResponse({ status: 200, description: 'Returns average rating, total count, and 5-star count' })
  async getStats() {
    return this.service.getStats();
  }
}
