import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { onboardingProgress } from '../../schema/membership';
import { eq, and, isNull } from 'drizzle-orm';

@Injectable()
export class OnboardingRepository {
  constructor(private readonly dbService: DBService) {}

  async findOrCreateProgress(organizationId: string, userId: string) {
    const [existing] = await this.dbService.db
      .select()
      .from(onboardingProgress)
      .where(
        and(
          eq(onboardingProgress.organizationId, organizationId),
          eq(onboardingProgress.userId, userId),
        ),
      );
    if (existing) return existing;

    const [row] = await this.dbService.db
      .insert(onboardingProgress)
      .values({ organizationId, userId })
      .returning();
    if (!row) throw new Error('Failed to create onboarding progress');
    return row;
  }

  async updateStep(
    organizationId: string,
    userId: string,
    currentStep: string,
    completedSteps: string[],
    data: Record<string, unknown>,
  ) {
    const [row] = await this.dbService.db
      .update(onboardingProgress)
      .set({
        currentStep,
        completedSteps,
        data,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(onboardingProgress.organizationId, organizationId),
          eq(onboardingProgress.userId, userId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async completeOnboarding(organizationId: string, userId: string) {
    const [row] = await this.dbService.db
      .update(onboardingProgress)
      .set({
        currentStep: 'complete',
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(onboardingProgress.organizationId, organizationId),
          eq(onboardingProgress.userId, userId),
        ),
      )
      .returning();
    return row ?? null;
  }

  async findIncompleteOnboarding(organizationId: string) {
    return this.dbService.db
      .select()
      .from(onboardingProgress)
      .where(
        and(
          eq(onboardingProgress.organizationId, organizationId),
          isNull(onboardingProgress.completedAt),
        ),
      );
  }
}
