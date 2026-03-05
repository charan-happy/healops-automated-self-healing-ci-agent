import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { emailVerificationTokens } from '@db/schema/auth-tokens';
import { eq, and, isNull, gt } from 'drizzle-orm';

@Injectable()
export class VerificationTokenRepository {
  constructor(private readonly dbService: DBService) {}

  async storeToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.dbService.db.insert(emailVerificationTokens).values({
      userId,
      tokenHash,
      expiresAt,
    });
  }

  async findValidToken(
    tokenHash: string,
  ): Promise<{ id: string; userId: string } | null> {
    const rows = await this.dbService.db
      .select({
        id: emailVerificationTokens.id,
        userId: emailVerificationTokens.userId,
      })
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async markUsed(tokenId: string): Promise<void> {
    await this.dbService.db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, tokenId));
  }
}
