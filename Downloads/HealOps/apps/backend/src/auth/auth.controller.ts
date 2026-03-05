import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { RouteNames } from '@common/route-names';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { MfaService } from './services/mfa.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { MfaVerifyDto } from './dto/mfa-verify.dto';
import { AuthUser } from './interfaces/auth-user.interface';
import { TokenResponse } from './interfaces/token-response.interface';

@Controller({ path: RouteNames.AUTH, version: '1' })
@ApiTags('Auth')
export class AuthController {
  private readonly frontendUrl: string;

  constructor(
    private readonly authService: AuthService,
    private readonly mfaService: MfaService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3099';
  }

  // ─── Provider Availability ───────────────────────────────────────────────

  @Get('providers')
  @Public()
  @ApiOperation({ summary: 'Get available auth providers' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Returns available auth providers' })
  getProviders(): { email: boolean; google: boolean; github: boolean; apple: boolean } {
    return this.authService.getAvailableProviders();
  }

  // ─── Registration & Login ──────────────────────────────────────────────────

  @Post('register')
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'User registered successfully' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Email already registered' })
  async register(@Body() dto: RegisterDto): Promise<TokenResponse> {
    return this.authService.register(dto);
  }

  @Post('login')
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Login successful' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto): Promise<TokenResponse & { isEmailVerified: boolean }> {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @Public()
  @Throttle({ short: { limit: 20, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using a refresh token' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshTokenDto): Promise<TokenResponse> {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke all refresh tokens' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Logged out successfully' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' })
  async logout(@CurrentUser() user: AuthUser): Promise<{ message: string }> {
    await this.authService.logout(user.id);
    return { message: 'Logged out successfully' };
  }

  // ─── Password Management ──────────────────────────────────────────────────

  @Post('change-password')
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the current user password' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Password changed successfully' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Current password is incorrect' })
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(user.id, dto);
    return { message: 'Password changed successfully' };
  }

  // ─── Email Verification ──────────────────────────────────────────────────

  @Post('verify-email')
  @Public()
  @Throttle({ short: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address using token from verification email' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Email verified successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid or expired token' })
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ verified: boolean }> {
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @Public()
  @Throttle({ short: { limit: 3, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Verification email sent if account exists' })
  async resendVerification(@Body() body: { email: string }): Promise<{ sent: boolean }> {
    return this.authService.resendVerification(body.email);
  }

  // ─── Forgot / Reset Password ────────────────────────────────────────────

  @Post('forgot-password')
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Reset email sent if account exists' })
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<{ sent: boolean }> {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  @Public()
  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token from reset email' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Password reset successfully' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid or expired token' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ reset: boolean }> {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  // ─── Google OAuth ─────────────────────────────────────────────────────────

  @Get('google')
  @Public()
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  @ApiResponse({ status: HttpStatus.FOUND, description: 'Redirects to Google OAuth' })
  googleAuth(): void {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @Public()
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  @ApiResponse({ status: HttpStatus.FOUND, description: 'Redirects to frontend with tokens' })
  async googleAuthCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const oauthUser = req.user as {
      provider: string;
      providerId: string;
      email: string;
      firstName?: string;
      lastName?: string;
      accessToken?: string;
      refreshToken?: string;
    };
    const tokens = await this.authService.handleOAuthLogin(oauthUser);
    const params = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: String(tokens.expiresIn),
    });
    res.redirect(`${this.frontendUrl}/auth/callback?${params.toString()}`);
  }

  // ─── GitHub OAuth ─────────────────────────────────────────────────────────

  @Get('github')
  @Public()
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Initiate GitHub OAuth login' })
  @ApiResponse({ status: HttpStatus.FOUND, description: 'Redirects to GitHub OAuth' })
  githubAuth(): void {
    // Guard redirects to GitHub
  }

  @Get('github/callback')
  @Public()
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  @ApiResponse({ status: HttpStatus.FOUND, description: 'Redirects to frontend with tokens' })
  async githubAuthCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const oauthUser = req.user as {
      provider: string;
      providerId: string;
      email: string;
      firstName?: string;
      lastName?: string;
      accessToken?: string;
      refreshToken?: string;
    };
    const tokens = await this.authService.handleOAuthLogin(oauthUser);
    const params = new URLSearchParams({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: String(tokens.expiresIn),
    });
    res.redirect(`${this.frontendUrl}/auth/callback?${params.toString()}`);
  }

  // ─── MFA ──────────────────────────────────────────────────────────────────

  @Post('mfa/setup')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set up TOTP-based multi-factor authentication' })
  @ApiResponse({ status: HttpStatus.OK, description: 'MFA setup initiated, returns QR code and secret' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' })
  async mfaSetup(
    @CurrentUser() user: AuthUser,
  ): Promise<{ secret: string; otpauthUrl: string; qrCode: string }> {
    return this.mfaService.setupTotp(user.id);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify a TOTP code to complete MFA setup or authenticate' })
  @ApiResponse({ status: HttpStatus.OK, description: 'MFA code verified' })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'Invalid MFA code' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Not authenticated' })
  async mfaVerify(
    @CurrentUser() user: AuthUser,
    @Body() dto: MfaVerifyDto,
  ): Promise<{ verified: boolean }> {
    const verified = await this.mfaService.verifyTotp(user.id, dto.code);
    return { verified };
  }
}
