import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RouteNames } from '@common/route-names';
import { Public } from '@auth/decorators/public.decorator';
import { Roles } from '@auth/decorators/roles.decorator';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';

@Controller({ path: RouteNames.HEALOPS_REVIEWS, version: '1' })
@ApiTags('Reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: 'Submit a public review (moderated before display)' })
  @ApiResponse({ status: 201, description: 'Review submitted for moderation' })
  async submitReview(@Body() dto: CreateReviewDto) {
    await this.reviewsService.submitReview(dto);
    return {
      submitted: true,
      message: 'Thank you! Your review will appear after approval.',
    };
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get all approved reviews (public)' })
  async getApprovedReviews(@Query() query: ListReviewsQueryDto) {
    return this.reviewsService.getApprovedReviews(
      query.limit ?? 20,
      query.offset ?? 0,
    );
  }

  @Get('stats')
  @Public()
  @ApiOperation({ summary: 'Get review aggregate stats (avg rating, count)' })
  async getStats() {
    return this.reviewsService.getStats();
  }

  @Patch(':id/approve')
  @Roles('admin')
  @ApiOperation({ summary: 'Approve a review (admin only)' })
  async approveReview(@Param('id', ParseUUIDPipe) id: string) {
    return this.reviewsService.approveReview(id);
  }
}
