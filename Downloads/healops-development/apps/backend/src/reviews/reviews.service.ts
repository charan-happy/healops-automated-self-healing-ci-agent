// ─── Reviews Service ────────────────────────────────────────────────────────
// Business logic for public reviews/testimonials.

import { Injectable, Logger } from '@nestjs/common';
import { ReviewsRepository } from '@db/repositories/healops/reviews.repository';

interface SubmitReviewInput {
  userName: string;
  userEmail?: string;
  userRole?: string;
  userCompany?: string;
  avatarUrl?: string;
  rating: number;
  title: string;
  comment: string;
}

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly reviewsRepository: ReviewsRepository) {}

  async submitReview(data: SubmitReviewInput) {
    const review = await this.reviewsRepository.createReview({
      userName: data.userName,
      userEmail: data.userEmail,
      userRole: data.userRole,
      userCompany: data.userCompany,
      avatarUrl: data.avatarUrl,
      rating: data.rating,
      title: data.title,
      comment: data.comment,
    });

    this.logger.log(
      `New review submitted by ${data.userName} (rating=${String(data.rating)})`,
    );

    return {
      id: review.id,
      submitted: true,
      message: 'Thank you for your review! It will be visible after approval.',
    };
  }

  async getApprovedReviews(limit: number, offset: number) {
    const [reviews, total] = await Promise.all([
      this.reviewsRepository.findApprovedReviews(limit, offset),
      this.reviewsRepository.countApprovedReviews(),
    ]);

    return {
      data: reviews.map((r) => ({
        id: r.id,
        userName: r.userName,
        userRole: r.userRole,
        userCompany: r.userCompany,
        avatarUrl: r.avatarUrl,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
      })),
      total,
      limit,
      offset,
    };
  }

  async getStats() {
    const stats = await this.reviewsRepository.getAggregateStats();

    return {
      averageRating: stats.averageRating ?? 0,
      totalCount: stats.totalCount ?? 0,
      fiveStarCount: stats.fiveStarCount ?? 0,
    };
  }
}
