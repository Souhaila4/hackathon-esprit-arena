import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationService {
  constructor(private readonly prisma: PrismaService) {}

  async findAllForUser(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number } = {},
  ) {
    const { unreadOnly = false, limit = 50 } = options;

    const where: { userId: string; read?: boolean } = { userId };
    if (unreadOnly) where.read = false;

    const notifications = await this.prisma.notification.findMany({
      where,
      include: {
        competition: {
          select: {
            id: true,
            title: true,
            status: true,
            specialty: true,
            startDate: true,
            endDate: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await this.prisma.notification.count({
      where: { userId, read: false },
    });

    return {
      data: notifications,
      unreadCount,
    };
  }

  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { read: true },
      include: {
        competition: {
          select: {
            id: true,
            title: true,
            status: true,
            specialty: true,
          },
        },
      },
    });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    return this.findAllForUser(userId);
  }
}
