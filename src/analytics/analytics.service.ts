import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface DeveloperDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mainSpecialty: string;
  skillTags: string[];
  totalChallenges: number;
  totalWins: number;
  winRate: number;
  avgScore: number;
  avatarUrl?: string | null;
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getDevelopers(filters?: {
    specialty?: string;
    skill?: string;
    minWins?: number;
  }): Promise<{ developers: DeveloperDto[]; total: number }> {
    // Build where clause
    const whereClause: any = {
      role: 'USER',
      competitionEntries: {
        some: {
          score: {
            not: null,
          },
        },
      },
    };

    // Filter by specialty if provided
    if (filters?.specialty) {
      whereClause.mainSpecialty = filters.specialty;
    }

    // Récupérer tous les utilisateurs qui ont participé à des compétitions
    const users = await this.prisma.user.findMany({
      where: whereClause,
      include: {
        competitionEntries: {
          where: {
            score: {
              not: null,
            },
          },
        },
      },
    });

    // Formatter les données
    const developers = users
      .map((user) => {
        const entries = user.competitionEntries;
        const scores = entries
          .map((e) => e.score)
          .filter((s): s is number => s !== null);
        const avgScore =
          scores.length > 0
            ? scores.reduce((a, b) => a + b, 0) / scores.length
            : 0;
        const wins = entries.filter((e) => e.isWinner).length;

        const developer: DeveloperDto = {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          mainSpecialty: user.mainSpecialty || 'FULLSTACK',
          skillTags: user.skillTags || [],
          totalChallenges: entries.length,
          totalWins: wins,
          winRate:
            entries.length > 0 ? Math.round((wins / entries.length) * 100) : 0,
          avgScore: Math.round(avgScore * 10) / 10,
          avatarUrl: user.avatarUrl || undefined,
        };

        return developer;
      })
      .filter((dev) => {
        // Appliquer les filtres
        if (filters?.minWins && dev.totalWins < filters.minWins) {
          return false;
        }
        if (filters?.skill && !dev.skillTags.includes(filters.skill)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.avgScore - a.avgScore); // Trier par score

    return {
      developers: developers.slice(0, 100), // Limiter à 100 pour la demo
      total: developers.length,
    };
  }
}
