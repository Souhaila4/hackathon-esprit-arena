import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class PasswordResetService {
  private readonly CODE_EXPIRY_MINUTES = 15;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async requestReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!user) {
      throw new NotFoundException('User with this email not found');
    }

    const code = this.generateCode();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.CODE_EXPIRY_MINUTES);

    await this.prisma.passwordReset.deleteMany({
      where: { email: email.toLowerCase() },
    });

    await this.prisma.passwordReset.create({
      data: {
        email: email.toLowerCase(),
        code,
        expiresAt,
      },
    });

    await this.emailService.sendPasswordResetCode(
      user.email,
      code,
      user.firstName,
    );
  }

  async verifyAndConsume(email: string, code: string): Promise<void> {
    const reset = await this.prisma.passwordReset.findFirst({
      where: {
        email: email.toLowerCase(),
        code,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!reset) {
      throw new BadRequestException('Invalid or expired reset code');
    }

    await this.prisma.passwordReset.delete({
      where: { id: reset.id },
    });
  }
}
