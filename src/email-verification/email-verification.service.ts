import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class EmailVerificationService {
  private readonly CODE_EXPIRY_MINUTES = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Generate a random 6-digit verification code
   */
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Send verification code to user's email
   */
  async sendVerificationCode(email: string, firstName: string): Promise<void> {
    const code = this.generateCode();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.CODE_EXPIRY_MINUTES);

    // Delete any existing verification codes for this email
    await this.prisma.emailVerification.deleteMany({
      where: { email: email.toLowerCase() },
    });

    // Create new verification code
    await this.prisma.emailVerification.create({
      data: {
        email: email.toLowerCase(),
        code,
        expiresAt,
      },
    });

    // Send email
    await this.emailService.sendVerificationCode(email, code, firstName);
  }

  /**
   * Verify the code and mark email as verified
   */
  async verifyCode(email: string, code: string): Promise<void> {
    const verification = await this.prisma.emailVerification.findFirst({
      where: {
        email: email.toLowerCase(),
        code,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!verification) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    // Update user's email verification status
    await this.prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { isEmailVerified: true },
    });

    // Delete the used verification code
    await this.prisma.emailVerification.delete({
      where: { id: verification.id },
    });
  }

  /**
   * Check if user's email is verified
   */
  async isEmailVerified(email: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { isEmailVerified: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user.isEmailVerified;
  }
}
