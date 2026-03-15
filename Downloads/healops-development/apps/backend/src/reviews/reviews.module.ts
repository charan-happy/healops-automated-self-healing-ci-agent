// ─── Reviews Module ─────────────────────────────────────────────────────────
// Public-facing reviews/testimonials for the landing page.
// All routes are public (no auth required).

import { Module } from '@nestjs/common';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
