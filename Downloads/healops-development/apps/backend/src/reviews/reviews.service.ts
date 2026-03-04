import { Injectable, Logger } from '@nestjs/common';
import { ReviewsRepository } from '@db/repositories/healops/reviews.repository';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(private readonly reviewsRepository: ReviewsRepository) {}

  async submitReview(dto: CreateReviewDto) {
    this.logger.log(
      `New review from ${dto.userName} (${String(dto.rating)} stars)`,
    );
    return this.reviewsRepository.createReview({
      userName: dto.userName,
      userEmail: dto.userEmail,
      userRole: dto.userRole,
      userCompany: dto.userCompany,
      rating: dto.rating,
      title: dto.title,
      comment: dto.comment,
      isApproved: false, // requires admin moderation
    });
  }

  async getApprovedReviews(limit = 20, offset = 0) {
    const [reviews, total] = await Promise.all([
      this.reviewsRepository.findApprovedReviews(limit, offset),
      this.reviewsRepository.countApprovedReviews(),
    ]);
    return { reviews, total, limit, offset };
  }

  async getStats() {
    return this.reviewsRepository.getAggregateStats();
  }

  async approveReview(id: string) {
    return this.reviewsRepository.approveReview(id);
  }
}
