import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UserModule } from '../user/user.module';
import { JwtStrategy } from './strategies/jwt.strategy';
import { EmailVerificationModule } from '../email-verification/email-verification.module';
import { CvExtractionModule } from '../cv-extraction/cv-extraction.module';
import { PasswordResetModule } from '../password-reset/password-reset.module';
import { ApifyModule } from '../apify/apify.module';
import { ScraperModule } from '../scraper/scraper.module';
import { StreamModule } from '../stream/stream.module';

function parseExpiresInToSeconds(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };
  return value * (multipliers[unit] ?? 86400);
}

@Module({
  imports: [
    UserModule,
    EmailVerificationModule,
    CvExtractionModule,
    ApifyModule,
    ScraperModule,
    StreamModule,
    PasswordResetModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const secret = config.getOrThrow<string>('JWT_SECRET');
        const expiresInStr = config.get<string>('JWT_EXPIRES_IN', '7d');
        const expiresInSeconds = parseExpiresInToSeconds(expiresInStr);
        return {
          secret,
          signOptions: { expiresIn: expiresInSeconds },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
