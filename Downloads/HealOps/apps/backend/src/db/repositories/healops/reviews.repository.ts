// ─── Public Reviews Repository ──────────────────────────────────────────────
// Data access for: public_reviews (user-facing testimonials)

import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { publicReviews } from '../../schema/reviews';
import { eq, desc, sql } from 'drizzle-orm';

@Injectable()
export class ReviewsRepository {
  constructor(private readonly dbService: DBService) {}

  // ─── Create ────────────────────────────────────────────────────────────

  async createReview(data: typeof publicReviews.$inferInsert) {
    const [row] = await this.dbService.db
      .insert(publicReviews)
      .values(data)
      .returning();
    if (!row) throw new Error('Failed to create review');
    return row;
  }

  // ─── Read (Public) ────────────────────────────────────────────────────

  async findApprovedReviews(limit: number, offset: number) {
    return this.dbService.db
      .select()
      .from(publicReviews)
      .where(eq(publicReviews.isApproved, true))
      .orderBy(desc(publicReviews.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countApprovedReviews(): Promise<number> {
    const [row] = await this.dbService.db
      .select({ count: sql<number>`count(*)::int` })
      .from(publicReviews)
      .where(eq(publicReviews.isApproved, true));
    return row?.count ?? 0;
  }

  async getAggregateStats() {
    const [row] = await this.dbService.db
      .select({
        averageRating: sql<number>`round(avg(rating)::numeric, 1)`,
        totalCount: sql<number>`count(*)::int`,
        fiveStarCount: sql<number>`count(*) filter (where rating = 5)::int`,
      })
      .from(publicReviews)
      .where(eq(publicReviews.isApproved, true));
    return row ?? { averageRating: 0, totalCount: 0, fiveStarCount: 0 };
  }

  // ─── Admin ─────────────────────────────────────────────────────────────

  async approveReview(id: string) {
    const [row] = await this.dbService.db
      .update(publicReviews)
      .set({ isApproved: true, updatedAt: new Date() })
      .where(eq(publicReviews.id, id))
      .returning();
    return row ?? null;
  }

  async findAllReviews(limit: number, offset: number) {
    return this.dbService.db
      .select()
      .from(publicReviews)
      .orderBy(desc(publicReviews.createdAt))
      .limit(limit)
      .offset(offset);
  }
}
