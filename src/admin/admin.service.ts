import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Specialty, RequestStatus, UserRole } from '@prisma/client';
import { ALL_SPECIALTIES } from '../stream/room-specialty.config';

const N8N_WEBHOOK_TEST_TIMEOUT_MS = 120_000;

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async updateUserRole(userId: string, role: string) {
    // Vérifie que la spécialité fait partie de l'énumération Prisma si besoin de validation,
    // ou caste `role` directement si c'est déjà validé par le DTO/Controller.
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: role as any },
      select: { id: true, email: true, role: true },
    });
    return updated;
  }

  async getCompanyRequests(status?: RequestStatus) {
    const where = status ? { status } : {};
    return this.prisma.companyRoleRequest.findMany({
      where,
      include: {
        user: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewCompanyRequest(
    requestId: string,
    status: 'APPROVED' | 'REJECTED',
  ) {
    const request = await this.prisma.companyRoleRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });
    if (!request) throw new NotFoundException('Company request not found');
    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`Request is already ${request.status}`);
    }

    return this.prisma.$transaction(async (prisma) => {
      const updatedReq = await prisma.companyRoleRequest.update({
        where: { id: requestId },
        data: { status },
      });

      if (status === RequestStatus.APPROVED) {
        await prisma.user.update({
          where: { id: request.userId },
          data: { role: UserRole.COMPANY },
        });
      }
      return updatedReq;
    });
  }

  async getDashboardStats() {
    const [
      totalUsers,
      usersByRole,
      usersBySpecialty,
      verifiedCount,
      bannedCount,
      noSpecialtyCount,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.groupBy({
        by: ['role'],
        _count: { id: true },
      }),
      this.prisma.user.groupBy({
        by: ['mainSpecialty'],
        _count: { id: true },
        where: { mainSpecialty: { not: null } },
      }),
      this.prisma.user.count({ where: { isEmailVerified: true } }),
      this.prisma.user.count({ where: { isBanned: true } }),
      this.prisma.user.count({ where: { mainSpecialty: null } }),
    ]);

    const byRole = usersByRole.reduce(
      (acc, r) => {
        acc[r.role] = r._count.id;
        return acc;
      },
      {} as Record<string, number>,
    );

    const bySpecialty = ALL_SPECIALTIES.reduce(
      (acc, s) => {
        const found = usersBySpecialty.find((x) => x.mainSpecialty === s);
        acc[s] = found?._count.id ?? 0;
        return acc;
      },
      {} as Record<Specialty, number>,
    );

    return {
      users: {
        total: totalUsers,
        verified: verifiedCount,
        banned: bannedCount,
        noSpecialty: noSpecialtyCount,
        byRole,
      },
      specialties: {
        list: ALL_SPECIALTIES,
        bySpecialty,
      },
      rooms: {
        total: ALL_SPECIALTIES.length,
        description: 'Une salle par spécialité (créée à la demande)',
      },
    };
  }

  private readonly userListSelect = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    role: true,
    mainSpecialty: true,
    isEmailVerified: true,
    isBanned: true,
    createdAt: true,
  } as const;

  /** Derniers utilisateurs inscrits */
  async getRecentUsers(limit = 10) {
    return this.prisma.user.findMany({
      take: Math.min(limit, 50),
      orderBy: { createdAt: 'desc' },
      select: this.userListSelect,
    });
  }

  /** Liste utilisateurs avec recherche et pagination */
  async getUsers(options: {
    limit?: number;
    offset?: number;
    search?: string;
    role?: UserRole;
  }) {
    const limit = Math.min(options.limit ?? 20, 100);
    const offset = options.offset ?? 0;
    const search = options.search?.trim().toLowerCase();

    const where: any = {};
    if (search) {
      where.OR = [
        { email: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } },
      ];
    }
    if (options.role) {
      where.role = options.role;
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: 'desc' },
        select: this.userListSelect,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, limit, offset };
  }

  /**
   * Appel du webhook n8n depuis le serveur pour éviter CORS.
   * Utilise l'URL de prod en priorité (toujours enregistrée) ; l'URL de test
   * n'est active qu'après avoir cliqué "Execute workflow" dans n8n.
   * Timeout 2 min pour attendre la réponse.
   */
  async triggerN8nWebhookTest(): Promise<{
    success: boolean;
    message?: string;
  }> {
    const url = process.env.N8N_WEBHOOK_URL || process.env.N8N_WEBHOOK_TEST_URL;
    if (!url) {
      return {
        success: false,
        message:
          'N8N_WEBHOOK_URL (ou N8N_WEBHOOK_TEST_URL) non configuré dans .env',
      };
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      N8N_WEBHOOK_TEST_TIMEOUT_MS,
    );
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const text = await res.text();
        return {
          success: false,
          message: text || `HTTP ${res.status}`,
        };
      }
      return { success: true };
    } catch (err) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      return {
        success: false,
        message: isAbort
          ? 'Délai dépassé (2 min). Vérifiez que le workflow a bien reçu le test event dans n8n.'
          : err instanceof Error
            ? err.message
            : 'Échec du déclenchement du workflow',
      };
    }
  }
}
