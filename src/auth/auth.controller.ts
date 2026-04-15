import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Param,
  Res,
} from '@nestjs/common';
import {
  FileInterceptor,
  FileFieldsInterceptor,
} from '@nestjs/platform-express';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignUpDto } from './dto/sign-up.dto';
import { SignInDto } from './dto/sign-in.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from '../user/dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { User } from '@prisma/client';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'resume', maxCount: 1 },
        { name: 'avatar', maxCount: 1 },
      ],
      {
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
          if (
            file.fieldname === 'resume' &&
            !file?.originalname?.toLowerCase().endsWith('.docx')
          ) {
            return cb(
              new BadRequestException('Resume must be a .docx file'),
              false,
            );
          }
          if (file.fieldname === 'avatar') {
            const isImageMime = file.mimetype?.startsWith('image/');
            const isImageExt = file.originalname?.match(
              /\.(jpg|jpeg|png|gif|webp)$/i,
            );
            if (!isImageMime && !isImageExt) {
              return cb(
                new BadRequestException('Avatar must be an image file'),
                false,
              );
            }
          }
          cb(null, true);
        },
      },
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Register a new user with resume',
    description:
      'Sign up with email, password, name, and a required avatar. Optional .docx resume enables CV extraction (mainSpecialty, skillTags).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email', 'password', 'firstName', 'lastName', 'avatar'],
      properties: {
        email: { type: 'string', example: 'user@example.com' },
        password: { type: 'string', example: 'secret1234', minLength: 8 },
        firstName: { type: 'string', example: 'Jane' },
        lastName: { type: 'string', example: 'Doe' },
        resume: {
          type: 'string',
          format: 'binary',
          description: 'Resume .docx (optional, max 5MB)',
        },
        avatar: {
          type: 'string',
          format: 'binary',
          description: 'Avatar Image for Facial Verification (required)',
        },
        githubUrl: {
          type: 'string',
          example: 'https://github.com/username',
          description: 'Optional',
        },
        linkedinUrl: {
          type: 'string',
          example: 'https://www.linkedin.com/in/username/',
          description: 'Optional, used to enrich skills via Apify',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description:
      'User created, verification code sent to email. No tokens until email is verified.',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error or missing/invalid avatar (or invalid resume)',
  })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async signUp(
    @Body() dto: SignUpDto,
    @UploadedFiles()
    files: { resume?: Express.Multer.File[]; avatar?: Express.Multer.File[] },
  ) {
    const resumeFile = files.resume?.[0];
    const avatarFile = files.avatar?.[0];

    if (!avatarFile?.buffer) {
      throw new BadRequestException(
        'Avatar image file is required for identity verification',
      );
    }
    return this.authService.signUp(
      dto,
      resumeFile?.buffer,
      avatarFile,
    );
  }

  @Get('avatar/:filename')
  @ApiOperation({ summary: 'Get user avatar image' })
  getAvatar(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = path.join(process.cwd(), 'uploads', 'avatars', filename);
    if (!fs.existsSync(filePath)) {
      throw new BadRequestException('Avatar not found');
    }
    return res.sendFile(filePath);
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in and get JWT' })
  @ApiResponse({ status: 200, description: 'Returns user and access token' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  async signIn(@Body() dto: SignInDto) {
    return this.authService.signIn(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email with 6-digit code and get JWT' })
  @ApiResponse({
    status: 200,
    description: 'Email verified, returns user and tokens',
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.email, dto.code);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend verification code to email' })
  @ApiResponse({ status: 200, description: 'Verification code sent' })
  @ApiResponse({
    status: 400,
    description: 'User not found or already verified',
  })
  async resendVerification(@Body() dto: ResendVerificationDto) {
    await this.authService.resendVerificationCode(dto.email);
    return { message: 'Verification code sent successfully' };
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset code by email' })
  @ApiResponse({ status: 200, description: 'Reset code sent to email' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.requestPasswordReset(dto.email);
    return {
      message:
        'If an account exists for this email, a reset code has been sent.',
    };
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with code from email' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired code' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.email, dto.code, dto.newPassword);
    return { message: 'Password reset successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current user (requires JWT)' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  me(@CurrentUser() user: User) {
    return user;
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiBody({
    type: UpdateProfileDto,
    description: 'Fields to update (all optional)',
  })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, dto);
  }

  @Post('profile/cv')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('resume', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!file?.originalname?.toLowerCase().endsWith('.docx')) {
          return cb(
            new BadRequestException('Only .docx resume files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Upload resume (.docx)',
    description:
      'Upload a .docx resume. Uses Hugging Face (kaaboura/cv-extraction-prediction) to predict specialty and extract skills, then updates your profile mainSpecialty and skillTags.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        resume: {
          type: 'string',
          format: 'binary',
          description: 'Resume file (.docx only, max 5MB)',
        },
      },
      required: ['resume'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Profile updated with extracted specialty and skills',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file (e.g. not .docx or extraction failed)',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async uploadCv(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Resume file is required');
    }
    return this.authService.uploadCvAndUpdateProfile(userId, file.buffer);
  }

  @Post('profile/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const isImageMime = file.mimetype?.startsWith('image/');
        const isImageExt = file.originalname?.match(
          /\.(jpg|jpeg|png|gif|webp)$/i,
        );
        if (!isImageMime && !isImageExt) {
          return cb(
            new BadRequestException('Face Image must be an image file'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update user avatar' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        avatar: {
          type: 'string',
          format: 'binary',
          description: 'Avatar Image (max 5MB)',
        },
      },
      required: ['avatar'],
    },
  })
  @ApiResponse({ status: 200, description: 'Profile updated with new avatar' })
  @ApiResponse({ status: 400, description: 'Invalid file' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Avatar file is required');
    }
    return this.authService.uploadAvatarAndUpdateProfile(userId, file);
  }

  @Post('fcm-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register FCM token for push notifications' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fcmToken: {
          type: 'string',
          description: 'Firebase Cloud Messaging token',
        },
      },
      required: ['fcmToken'],
    },
  })
  @ApiResponse({ status: 200, description: 'FCM token registered' })
  async registerFcmToken(
    @CurrentUser('id') userId: string,
    @Body('fcmToken') fcmToken: string,
  ) {
    await this.authService.updateFcmToken(userId, fcmToken);
    return { message: 'FCM token registered' };
  }
}
