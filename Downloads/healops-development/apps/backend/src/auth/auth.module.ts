import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EnvConfig } from '@config/env.config';
import { HashingService } from '@common/hashing/hashing.service';
import { BcryptService } from '@common/hashing/bcrypt.service';

// Controller
import { AuthController } from './auth.controller';

// Services
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { MfaService } from './services/mfa.service';
import { ApiKeyService } from './services/api-key.service';
import { OAuthService } from './services/oauth.service';

// Strategies
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { GoogleOAuthStrategy } from './strategies/google-oauth.strategy';
import { GithubOAuthStrategy } from './strategies/github-oauth.strategy';

// Guards
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { ApiKeyGuard } from './guards/api-key.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService<EnvConfig>) => ({
        secret: configService.get<string>('JWT_SECRET') ?? 'default-secret-change-me',
        signOptions: {
          expiresIn: 900, // 15 minutes
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    // Services
    AuthService,
    TokenService,
    MfaService,
    ApiKeyService,
    OAuthService,

    // Hashing
    { provide: HashingService, useClass: BcryptService },

    // Strategies
    JwtStrategy,
    JwtRefreshStrategy,
    GoogleOAuthStrategy,
    GithubOAuthStrategy,

    // Guards (exported for global registration)
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    ApiKeyGuard,
  ],
  exports: [
    AuthService,
    TokenService,
    ApiKeyService,
    JwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
    ApiKeyGuard,
    HashingService,
  ],
})
export class AuthModule {}
