import {
  Injectable,
  Logger,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash } from 'crypto';
import { HashingService } from '@common/hashing/hashing.service';
import { TokenService } from './services/token.service';
import { OAuthService } from './services/oauth.service';
import { AuthRepository } from '@db/repositories/auth/auth.repository';
import { VerificationTokenRepository } from '@db/repositories/auth/verification-token.repository';
import { PasswordResetTokenRepository } from '@db/repositories/auth/password-reset-token.repository';
import { EmailService } from '@email/email.service';
import { TokenResponse } from './interfaces/token-response.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly hashingService: HashingService,
    private readonly tokenService: TokenService,
    private readonly oauthService: OAuthService,
    private readonly configService: ConfigService,
    private readonly verificationTokenRepository: VerificationTokenRepository,
    private readonly passwordResetTokenRepository: PasswordResetTokenRepository,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Returns which auth providers are configured and available.
   */
  getAvailableProviders(): { email: boolean; google: boolean; github: boolean; apple: boolean } {
    const googleId = this.configService.get<string>('GOOGLE_CLIENT_ID') ?? '';
    const githubId = this.configService.get<string>('GITHUB_CLIENT_ID') ?? '';

    return {
      email: true,
      google: googleId.length > 0 && googleId !== 'disabled-google-client-id',
      github: githubId.length > 0 && githubId !== 'Iv1.xxxxxxxxx',
      apple: false,
    };
  }

  /**
   * Registers a new user with the given credentials.
   * Hashes the password, assigns the default 'user' role, generates tokens,
   * and sends a verification email.
   */
  async register(dto: RegisterDto): Promise<TokenResponse> {
    // Check if email is already taken
    const existingUser = await this.authRepository.findUserByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.hashingService.hash(dto.password);

    const userId = await this.authRepository.createUser({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });

    // Assign default 'user' role
    await this.authRepository.assignRole(userId, 'user');

    // Send verification email (non-blocking)
    this.sendVerificationEmail(userId, dto.email, dto.firstName ?? '').catch((err) => {
      this.logger.error(`Failed to send verification email to ${dto.email}: ${String(err)}`);
    });

    const authUser = await this.authRepository.getUserWithRolesAndPermissions(userId);

    return this.tokenService.generateTokens(authUser);
  }

  /**
   * Authenticates a user with email and password.
   * Loads roles and permissions, then generates a token pair.
   */
  async login(dto: LoginDto): Promise<TokenResponse & { isEmailVerified: boolean }> {
    const user = await this.authRepository.findUserByEmail(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Please use OAuth to sign in');
    }

    const isPasswordValid = await this.hashingService.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const authUser = await this.authRepository.getUserWithRolesAndPermissions(user.id);
    const tokens = await this.tokenService.generateTokens(authUser);

    return {
      ...tokens,
      isEmailVerified: user.isEmailVerified,
    };
  }

  /**
   * Refreshes the token pair using a valid refresh token.
   * Delegates to TokenService which handles rotation and revocation.
   */
  async refreshTokens(refreshToken: string): Promise<TokenResponse> {
    return this.tokenService.refreshTokens(refreshToken);
  }

  /**
   * Logs out a user by revoking all their refresh tokens.
   */
  async logout(userId: string): Promise<void> {
    await this.tokenService.revokeAllUserTokens(userId);
  }

  /**
   * Changes a user's password after verifying the current password.
   * Revokes all existing refresh tokens for security.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.authRepository.findUserById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Cannot change password for OAuth-only accounts');
    }

    const isCurrentValid = await this.hashingService.compare(dto.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const newPasswordHash = await this.hashingService.hash(dto.newPassword);

    await this.authRepository.updateUserPassword(userId, newPasswordHash);

    // Revoke all refresh tokens after password change
    await this.tokenService.revokeAllUserTokens(userId);
  }

  /**
   * Handles OAuth login by delegating to OAuthService, then generating tokens.
   */
  async handleOAuthLogin(profile: {
    provider: string;
    providerId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    accessToken?: string;
    refreshToken?: string;
  }): Promise<TokenResponse> {
    const authUser = await this.oauthService.findOrCreateOAuthUser(profile);
    return this.tokenService.generateTokens(authUser);
  }

  // ─── Email Verification ──────────────────────────────────────────────────

  /**
   * Generates a verification token, stores its SHA-256 hash, and sends the
   * verify-email template to the user.
   */
  async sendVerificationEmail(userId: string, email: string, firstName: string): Promise<void> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    // 24-hour expiry
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.verificationTokenRepository.storeToken(userId, tokenHash, expiresAt);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const verifyUrl = `${frontendUrl}/verify-email?token=${rawToken}`;

    await this.emailService.sendTemplateEmail(
      email,
      'verify-email',
      {
        name: firstName || 'there',
        verifyUrl,
        expiresIn: '24 hours',
        appName: 'HealOps',
        year: new Date().getFullYear(),
      },
      { subject: 'Verify your HealOps email address' },
    );

    this.logger.log(`Verification email sent to ${email}`);
  }

  /**
   * Verifies an email using the raw token from the URL.
   * Hashes it with SHA-256 and looks up the stored hash.
   */
  async verifyEmail(rawToken: string): Promise<{ verified: boolean }> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const record = await this.verificationTokenRepository.findValidToken(tokenHash);
    if (!record) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.authRepository.updateEmailVerified(record.userId, true);
    await this.verificationTokenRepository.markUsed(record.id);

    this.logger.log(`Email verified for user ${record.userId}`);
    return { verified: true };
  }

  /**
   * Resends the verification email for a given email address.
   */
  async resendVerification(email: string): Promise<{ sent: boolean }> {
    const user = await this.authRepository.findUserByEmail(email);
    if (!user) {
      // Silent success to prevent email enumeration
      return { sent: true };
    }

    if (user.isEmailVerified) {
      return { sent: true };
    }

    await this.sendVerificationEmail(user.id, user.email, '');
    return { sent: true };
  }

  // ─── Forgot / Reset Password ─────────────────────────────────────────────

  /**
   * Sends a password reset email. Always returns success to prevent enumeration.
   */
  async forgotPassword(email: string): Promise<{ sent: boolean }> {
    const user = await this.authRepository.findUserByEmail(email);

    if (!user || !user.passwordHash) {
      // Silent success — don't reveal whether the email exists
      return { sent: true };
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    // 1-hour expiry
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await this.passwordResetTokenRepository.storeToken(user.id, tokenHash, expiresAt);

    const frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    await this.emailService.sendTemplateEmail(
      email,
      'reset-password',
      {
        name: user.email.split('@')[0] ?? 'there',
        resetUrl,
        expiresIn: '1 hour',
        appName: 'HealOps',
        year: new Date().getFullYear(),
      },
      { subject: 'Reset your HealOps password' },
    );

    this.logger.log(`Password reset email sent to ${email}`);
    return { sent: true };
  }

  /**
   * Resets the password using a valid reset token.
   * Revokes all refresh tokens after reset.
   */
  async resetPassword(rawToken: string, newPassword: string): Promise<{ reset: boolean }> {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const record = await this.passwordResetTokenRepository.findValidToken(tokenHash);
    if (!record) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const newPasswordHash = await this.hashingService.hash(newPassword);

    await this.authRepository.updateUserPassword(record.userId, newPasswordHash);
    await this.passwordResetTokenRepository.markUsed(record.id);

    // Revoke all refresh tokens for security
    await this.tokenService.revokeAllUserTokens(record.userId);

    this.logger.log(`Password reset for user ${record.userId}`);
    return { reset: true };
  }
}
