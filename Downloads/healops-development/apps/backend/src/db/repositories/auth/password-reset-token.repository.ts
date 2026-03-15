import { Injectable } from '@nestjs/common';
import { DBService } from '@db/db.service';
import { passwordResetTokens } from '@db/schema/auth-tokens';
import { eq, and, isNull, gt } from 'drizzle-orm';

@Injectable()
export class PasswordResetTokenRepository {
  constructor(private readonly dbService: DBService) {}

  async storeToken(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.dbService.db.insert(passwordResetTokens).values({
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
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
      })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  }

  async markUsed(tokenId: string): Promise<void> {
    await this.dbService.db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, tokenId));
  }
}
