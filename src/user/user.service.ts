import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import type { UpdateProfileDto } from './dto/update-profile.dto';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role?: UserRole;
  githubUrl?: string;
  linkedinUrl?: string;
  avatarUrl?: string;
  isEmailVerified?: boolean; // Set to true on signup (email verification removed)
}

const PROFILE_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
  isEmailVerified: true,
  mainSpecialty: true,
  skillTags: true,
  githubUrl: true,
  linkedinUrl: true,
  linkedinPosts: true,
  githubRepos: true,
  socialDataLastUpdate: true,
  totalChallenges: true,
  totalWins: true,
  walletBalance: true,
  hederaAccountId: true,
  isBanned: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  async requestCompanyRole(
    userId: string,
    dto: { companyName: string; description?: string },
  ) {
    const existing = await this.prisma.companyRoleRequest.findFirst({
      where: { userId, status: 'PENDING' },
    });
    if (existing) {
      throw new ConflictException(
        'You already have a pending company role request.',
      );
    }

    return this.prisma.companyRoleRequest.create({
      data: {
        userId,
        companyName: dto.companyName,
        description: dto.description,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: PROFILE_SELECT,
    });
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const data = {
      ...(dto.firstName !== undefined && { firstName: dto.firstName.trim() }),
      ...(dto.lastName !== undefined && { lastName: dto.lastName.trim() }),
      ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      ...(dto.mainSpecialty !== undefined && {
        mainSpecialty: dto.mainSpecialty,
      }),
      ...(dto.skillTags !== undefined && { skillTags: dto.skillTags }),
      ...(dto.githubUrl !== undefined && {
        githubUrl: dto.githubUrl === '' ? null : dto.githubUrl,
      }),
      ...(dto.linkedinUrl !== undefined && {
        linkedinUrl: dto.linkedinUrl === '' ? null : dto.linkedinUrl,
      }),
      ...(dto.linkedinPosts !== undefined && {
        linkedinPosts: dto.linkedinPosts,
      }),
      ...(dto.githubRepos !== undefined && { githubRepos: dto.githubRepos }),
      ...(dto.socialDataLastUpdate !== undefined && {
        socialDataLastUpdate: dto.socialDataLastUpdate,
      }),
    };

    if (Object.keys(data).length === 0) {
      return this.findById(userId);
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: PROFILE_SELECT,
    });
  }

  async updatePasswordByEmail(
    email: string,
    passwordHash: string,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { passwordHash },
    });
  }

  async updateWallet(userId: string, hederaAccountId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { hederaAccountId },
      select: { id: true, hederaAccountId: true },
    });
  }

  async updateFcmToken(userId: string, fcmToken: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { fcmToken },
    });
  }

  async create(data: CreateUserInput) {
    const email = data.email.toLowerCase();
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException('User with this email already exists');
    }
    return this.prisma.user.create({
      data: {
        email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role ?? UserRole.USER,
        ...(data.isEmailVerified != null && { isEmailVerified: data.isEmailVerified }),
        ...(data.avatarUrl != null &&
          data.avatarUrl !== '' && { avatarUrl: data.avatarUrl }),
        ...(data.githubUrl != null &&
          data.githubUrl !== '' && { githubUrl: data.githubUrl.trim() }),
        ...(data.linkedinUrl != null &&
          data.linkedinUrl !== '' && { linkedinUrl: data.linkedinUrl.trim() }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });
  }

  /**
   * Récupère le classement public de tous les utilisateurs.
   * XP calculé dynamiquement : baseXP + (skillTags.length * 150) + random(0-200)
   * Classés par XP décroissant
   */
  async getLeaderboard() {
    const users = await this.prisma.user.findMany({
      where: {
        isEmailVerified: true,
        isBanned: false,
        role: UserRole.USER,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        mainSpecialty: true,
        skillTags: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Calcul de l'XP pour chaque utilisateur
    const usersWithXP = users.map((user) => {
      // Formule XP : base (500-2000 selon ancienneté) + skillTags * 150 + variation aléatoire
      const daysSinceCreation = Math.floor(
        (Date.now() - new Date(user.createdAt).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      const baseXP = Math.min(500 + daysSinceCreation * 5, 2000);
      const skillsXP = (user.skillTags?.length || 0) * 150;

      // Utiliser l'ID comme seed pour un "random" déterministe
      const seed =
        user.id.charCodeAt(0) + user.id.charCodeAt(user.id.length - 1);
      const randomVariation = seed % 201;

      const totalXP = Math.floor(baseXP + skillsXP + randomVariation);

      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        mainSpecialty: user.mainSpecialty || 'Non spécifié',
        xp: totalXP,
        skillTags: user.skillTags || [],
      };
    });

    // Trier par XP décroissant
    usersWithXP.sort((a, b) => b.xp - a.xp);

    // Ajouter le rang
    const leaderboard = usersWithXP.map((user, index) => ({
      ...user,
      rank: index + 1,
    }));

    return {
      total: leaderboard.length,
      users: leaderboard,
    };
  }
}
