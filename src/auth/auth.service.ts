import {
  HttpException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { CvExtractionService } from '../cv-extraction/cv-extraction.service';
import { PasswordResetService } from '../password-reset/password-reset.service';
import { StreamService } from '../stream/stream.service';
import { GENERAL_MEMBER_ROOM_ID } from '../stream/room-specialty.config';
import { ApifyService } from '../apify/apify.service';
import { ScraperService } from '../scraper/scraper.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { AuthTokens, AuthUser, JwtPayload } from './auth.types';
import { UserRole, Specialty } from '@prisma/client';
import type { UpdateProfileDto } from '../user/dto/update-profile.dto';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly jwtExpiresIn: string;

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly cvExtractionService: CvExtractionService,
    private readonly apifyService: ApifyService,
    private readonly scraperService: ScraperService,
    private readonly passwordResetService: PasswordResetService,
    private readonly streamService: StreamService,
  ) {
    this.jwtExpiresIn = this.config.get<string>('JWT_EXPIRES_IN', '7d');
  }

  async signUp(
    dto: SignUpDto,
    resumeBuffer: Buffer | undefined,
    avatarFile?: Express.Multer.File,
  ): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    try {
      let avatarUrl: string | null = null;
      if (avatarFile?.buffer) {
        const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars');
        fs.mkdirSync(uploadsDir, { recursive: true });
        const ext = path.extname(avatarFile.originalname) || '.jpg';
        const filename = `${randomUUID()}${ext}`;
        fs.writeFileSync(path.join(uploadsDir, filename), avatarFile.buffer);
        avatarUrl = `/auth/avatar/${filename}`;
      }

      const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
      const user = await this.userService.create({
        email: dto.email,
        passwordHash,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        role: UserRole.USER,
        ...(dto.githubUrl && { githubUrl: dto.githubUrl.trim() }),
        ...(dto.linkedinUrl && { linkedinUrl: dto.linkedinUrl.trim() }),
        ...(avatarUrl && { avatarUrl }),
      });

      if (resumeBuffer?.length) {
        try {
          const extraction =
            await this.cvExtractionService.extractFromBuffer(resumeBuffer);
          const updateDto: UpdateProfileDto = {};
          if (extraction.mainSpecialty != null)
            updateDto.mainSpecialty = extraction.mainSpecialty as Specialty;
          if (extraction.skillTags.length > 0)
            updateDto.skillTags = extraction.skillTags;
          if (Object.keys(updateDto).length > 0) {
            await this.userService.updateProfile(user.id, updateDto);
          }
        } catch {
          // CV extraction failed (e.g. Hugging Face timeout) — signup continues without it
        }
      }

      // Enrichissement compétences via Apify (LinkedIn)
      if (dto.linkedinUrl?.trim()) {
        console.log('[SIGNUP] LinkedIn URL detected:', dto.linkedinUrl);
        try {
          const linkedInSkills = await this.apifyService.getLinkedInSkills(
            dto.linkedinUrl.trim(),
          );
          console.log(
            '[SIGNUP] LinkedIn skills scraped:',
            linkedInSkills.length,
            'skills',
          );
          if (linkedInSkills.length > 0) {
            const current = await this.userService.findById(user.id);
            const existingTags =
              (current as { skillTags?: string[] })?.skillTags ?? [];
            const merged = Array.from(
              new Set([
                ...existingTags.map((s) => s.toLowerCase()),
                ...linkedInSkills,
              ]),
            ).slice(0, 30);
            await this.userService.updateProfile(user.id, {
              skillTags: merged,
            });
          }
        } catch (err) {
          console.error('[SIGNUP] LinkedIn skills scraping failed:', err);
          // Apify failed or timeout — signup continues without LinkedIn skills
        }

        // DÉSACTIVÉ: Récupération des posts LinkedIn (nécessite abonnement payant Apify)
        // Pour réactiver, voir: https://console.apify.com/actors
        /*
        try {
          console.log('[SIGNUP] Scraping LinkedIn posts...');
          const linkedInPosts = await this.apifyService.getLinkedInPosts(dto.linkedinUrl.trim());
          console.log('[SIGNUP] LinkedIn posts scraped:', linkedInPosts.length, 'posts');
          if (linkedInPosts.length > 0) {
            await this.userService.updateProfile(user.id, { 
              linkedinPosts: linkedInPosts,
              socialDataLastUpdate: new Date()
            });
            console.log('[SIGNUP] LinkedIn posts saved to database');
          }
        } catch (err) {
          console.error('[SIGNUP] LinkedIn posts scraping failed:', err);
          // Scraping posts LinkedIn a échoué - continue sans posts
        }
        */
      }

      // Récupération des 3 derniers repos GitHub (via API REST gratuite)
      if (dto.githubUrl?.trim()) {
        console.log('[SIGNUP] GitHub URL detected:', dto.githubUrl);
        try {
          console.log('[SIGNUP] Scraping GitHub repos via free REST API...');
          const githubRepos = await this.scraperService.getGitHubRepos(
            dto.githubUrl.trim(),
          );
          console.log(
            '[SIGNUP] GitHub repos scraped:',
            githubRepos.length,
            'repos',
          );
          if (githubRepos.length > 0) {
            await this.userService.updateProfile(user.id, {
              githubRepos: githubRepos,
              socialDataLastUpdate: new Date(),
            });
            console.log('[SIGNUP] GitHub repos saved to database');
          }
        } catch (err) {
          console.error('[SIGNUP] GitHub repos scraping failed:', err);
          // Scraping GitHub a échoué - continue sans repos
        }
      }

      void this.streamService
        .ensureRoomMember(user.id, GENERAL_MEMBER_ROOM_ID)
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(
            `[SIGNUP] Could not add user to general member room (${GENERAL_MEMBER_ROOM_ID}): ${msg}`,
          );
        });

      // Generate and return tokens immediately (email verification removed)
      const payload: JwtPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      };
      const tokens = this.issueTokens(payload);

      return {
        user: this.toAuthUser(user),
        tokens,
      };
    } catch (err: unknown) {
      if (err instanceof HttpException) throw err;
      const msg = err instanceof Error ? err.message : 'Signup failed';
      throw new InternalServerErrorException(msg);
    }
  }

  async signIn(
    dto: SignInDto,
  ): Promise<{ user: AuthUser; tokens: AuthTokens }> {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    if (user.isBanned) {
      throw new BadRequestException('Account is banned');
    }
    if (!user.isEmailVerified) {
      throw new BadRequestException(
        'Please verify your email before signing in. Check your inbox for the verification code.',
      );
    }
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const tokens = this.issueTokens(payload);
    return {
      user: this.toAuthUser(user),
      tokens,
    };
  }

  async validateUserById(id: string) {
    return this.userService.findById(id);
  }

  private issueTokens(payload: JwtPayload): AuthTokens {
    const expiresInSeconds = this.parseExpiresInToSeconds(this.jwtExpiresIn);
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: expiresInSeconds,
    });
    return { accessToken, expiresIn: expiresInSeconds };
  }

  private toAuthUser(user: {
    id: string;
    email: string;
    role: string;
    firstName: string;
    lastName: string;
  }): AuthUser {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  private parseExpiresInToSeconds(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60; // default 7 days in seconds
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

  async requestPasswordReset(email: string): Promise<void> {
    await this.passwordResetService.requestReset(email);
  }

  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<void> {
    await this.passwordResetService.verifyAndConsume(email, code);
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await this.userService.updatePasswordByEmail(email, passwordHash);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    return this.userService.updateProfile(userId, dto);
  }

  /**
   * Upload resume (.docx), run CV extraction via Hugging Face, then update user's mainSpecialty and skillTags.
   */
  async uploadCvAndUpdateProfile(userId: string, buffer: Buffer) {
    const extraction = await this.cvExtractionService.extractFromBuffer(buffer);
    const dto: UpdateProfileDto = {};
    if (extraction.mainSpecialty != null)
      dto.mainSpecialty = extraction.mainSpecialty as Specialty;
    if (extraction.skillTags.length > 0) dto.skillTags = extraction.skillTags;
    return this.userService.updateProfile(userId, dto);
  }

  /**
   * Upload new avatar and update user's profile.
   */
  async uploadAvatarAndUpdateProfile(
    userId: string,
    avatarFile: Express.Multer.File,
  ) {
    const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const ext = path.extname(avatarFile.originalname) || '.jpg';
    const filename = `${randomUUID()}${ext}`;
    fs.writeFileSync(path.join(uploadsDir, filename), avatarFile.buffer);
    const avatarUrl = `/auth/avatar/${filename}`;

    return this.userService.updateProfile(userId, { avatarUrl });
  }

  /**
   * Update the user's FCM token for push notifications.
   */
  async updateFcmToken(userId: string, fcmToken: string) {
    return this.userService.updateFcmToken(userId, fcmToken);
  }
}
