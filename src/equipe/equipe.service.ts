import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { StreamService } from '../stream/stream.service';
import {
  EquipeStatus,
  EquipeMemberRole,
  EquipeInvitationStatus,
  CompetitionStatus,
  ParticipantStatus,
  UserRole,
  CheckpointStatus,
} from '@prisma/client';
import { CreateEquipeDto, InviteToEquipeDto } from './equipe.dto';

/** Taille d'équipe (leader inclus) : min/max pour valider le groupe. */
const MIN_TEAM_MEMBERS = 4;
const MAX_TEAM_MEMBERS = 6;

/** Même logique que joinCompetition : image anti-triche stockée sous /uploads/hackathon-faces/ */
function saveHackathonFaceImage(
  userId: string,
  competitionId: string,
  faceImage: Express.Multer.File,
): string {
  const uploadDir = path.join(process.cwd(), 'uploads', 'hackathon-faces');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  const ext = path.extname(faceImage.originalname || '') || '.jpg';
  const filename = `face-${userId}-${competitionId}-${uniqueSuffix}${ext}`;
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, faceImage.buffer);
  return `/uploads/hackathon-faces/${filename}`;
}

@Injectable()
export class EquipeService {
  private readonly logger = new Logger(EquipeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly streamService: StreamService,
  ) {}

  /**
   * Crée des CheckpointSubmissions pour une équipe si elles n'existent pas déjà.
   * create + ignore P2002 : sur MongoDB, upsert sur clé composée peut échouer pour
   * plusieurs équipes créées successivement.
   */
  async ensureCheckpointSubmissionsForEquipe(
    equipeId: string,
    competitionId: string,
    tx?: any,
  ) {
    const prisma = tx || this.prisma;
    const checkpoints = await prisma.competitionCheckpoint.findMany({
      where: { competitionId },
      select: { id: true },
    });

    for (const cp of checkpoints) {
      try {
        await prisma.checkpointSubmission.create({
          data: {
            checkpointId: cp.id,
            equipeId,
            status: CheckpointStatus.PENDING,
          },
        });
      } catch (e) {
        if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
          continue;
        }
        throw e;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // CREATE EQUIPE
  // ─────────────────────────────────────────────────────────────────

  async createEquipe(
    dto: CreateEquipeDto,
    userId: string,
    faceImage?: Express.Multer.File,
  ) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: dto.competitionId },
    });
    if (!competition) {
      throw new NotFoundException('Competition not found');
    }
    if (
      competition.status !== CompetitionStatus.OPEN_FOR_ENTRY &&
      competition.status !== CompetitionStatus.RUNNING
    ) {
      throw new BadRequestException(
        'Competition is not open for registration',
      );
    }

    // Check user is not already in a team for this competition
    const existingMembership = await this.prisma.equipeMember.findFirst({
      where: {
        userId,
        equipe: { competitionId: dto.competitionId },
      },
    });
    if (existingMembership) {
      throw new ConflictException(
        'You are already in a team for this competition',
      );
    }

    const existingParticipation =
      await this.prisma.competitionParticipant.findUnique({
        where: {
          competitionId_userId: {
            competitionId: dto.competitionId,
            userId,
          },
        },
      });

    if (existingParticipation?.equipeId) {
      throw new ConflictException(
        'You are already in a team for this competition.',
      );
    }

    // Limite = nombre de PERSONNES inscrites au hackathon, pas le nombre d'équipes.
    if (competition.maxParticipants !== null) {
      const currentCount = await this.prisma.competitionParticipant.count({
        where: {
          competitionId: dto.competitionId,
          status: ParticipantStatus.JOINED,
        },
      });
      if (!existingParticipation && currentCount >= competition.maxParticipants) {
        throw new BadRequestException(
          `Participant limit reached for this hackathon (${currentCount}/${competition.maxParticipants} people). ` +
            'This is a cap on registered users, not on teams. Raise maxParticipants or leave it empty for unlimited.',
        );
      }
    }

    let hackathonFaceUrl = '/uploads/hackathon-faces/default.png';
    if (faceImage?.buffer?.length) {
      try {
        hackathonFaceUrl = saveHackathonFaceImage(
          userId,
          dto.competitionId,
          faceImage,
        );
      } catch (err) {
        this.logger.error(
          `Failed to save hackathon face image for equipe creation: ${err}`,
        );
        throw new BadRequestException(
          'Could not save face image. Check server disk permissions or image format.',
        );
      }
    }

    try {
      const equipe = await this.prisma.$transaction(async (tx) => {
        // Garde anti-course : un seul membership par (user, hackathon) au niveau DB (voir schema).
        const alreadyMember = await tx.equipeMember.findFirst({
          where: {
            userId,
            equipe: { competitionId: dto.competitionId },
          },
        });
        if (alreadyMember) {
          throw new ConflictException(
            'You are already in a team for this competition',
          );
        }

        const newEquipe = await tx.equipe.create({
          data: {
            name: dto.name,
            competitionId: dto.competitionId,
            status: EquipeStatus.FORMING,
          },
        });

        await tx.equipeMember.create({
          data: {
            equipeId: newEquipe.id,
            userId,
            role: EquipeMemberRole.LEADER,
          },
        });

        await tx.competitionParticipant.upsert({
          where: {
            competitionId_userId: {
              competitionId: dto.competitionId,
              userId,
            },
          },
          create: {
            competitionId: dto.competitionId,
            userId,
            equipeId: newEquipe.id,
            status: ParticipantStatus.JOINED,
            hackathonFaceUrl,
          },
          update: {
            equipeId: newEquipe.id,
            status: ParticipantStatus.JOINED,
            ...(faceImage?.buffer?.length ? { hackathonFaceUrl } : {}),
          },
        });

        await this.ensureCheckpointSubmissionsForEquipe(
          newEquipe.id,
          dto.competitionId,
          tx,
        );

        if (!existingParticipation) {
          await tx.user.update({
            where: { id: userId },
            data: { totalChallenges: { increment: 1 } },
          });
        }

        return newEquipe;
      });

      void this.streamService
        .createTeamChannel(equipe.id, dto.competitionId, dto.name, [userId])
        .catch((err) =>
          this.logger.warn(
            `Failed to create team chat channel for equipe ${equipe.id}: ${err?.message ?? err}`,
          ),
        );

      return this.getEquipeById(equipe.id);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Error in createEquipe for user ${userId}: ${msg}`, stack);
      if (error instanceof PrismaClientKnownRequestError) {
        this.logger.error(
          `Prisma ${error.code} — meta: ${JSON.stringify(error.meta)}`,
        );
        // P2002 = violation d'unicité (ex. double clic, 2 requêtes parallèles, ou ligne participant déjà existante).
        // Sans mapping, Nest renvoie 500. Voir analyse dans les notes de déploiement / équipe.
        if (error.code === 'P2002') {
          throw new ConflictException(
            'Contrainte unique : vous êtes peut-être déjà inscrit à ce hackathon, ou la requête a été doublonnée. Actualisez et réessayez.',
          );
        }
      }
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // GET EQUIPE
  // ─────────────────────────────────────────────────────────────────

  async getEquipeById(equipeId: string) {
    const equipe = await this.prisma.equipe.findUnique({
      where: { id: equipeId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
                mainSpecialty: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        invitations: {
          where: { status: EquipeInvitationStatus.PENDING },
          include: {
            invitee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                avatarUrl: true,
              },
            },
          },
        },
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

    if (!equipe) {
      throw new NotFoundException('Equipe not found');
    }

    return equipe;
  }

  async getMyEquipe(competitionId: string, userId: string) {
    const membership = await this.prisma.equipeMember.findFirst({
      where: {
        userId,
        equipe: { competitionId },
      },
      include: {
        equipe: {
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    avatarUrl: true,
                    mainSpecialty: true,
                  },
                },
              },
              orderBy: { joinedAt: 'asc' },
            },
            invitations: {
              where: { status: EquipeInvitationStatus.PENDING },
              include: {
                invitee: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                    avatarUrl: true,
                  },
                },
              },
            },
            competition: {
              select: {
                id: true,
                title: true,
                status: true,
                specialty: true,
              },
            },
          },
        },
      },
    });

    if (!membership) {
      return null;
    }

    return {
      ...membership.equipe,
      myRole: membership.role,
    };
  }

  async getCompetitionEquipes(competitionId: string) {
    const equipes = await this.prisma.equipe.findMany({
      where: { competitionId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatarUrl: true,
                mainSpecialty: true,
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return { competitionId, equipes, total: equipes.length };
  }

  // ─────────────────────────────────────────────────────────────────
  // INVITE
  // ─────────────────────────────────────────────────────────────────

  async inviteToEquipe(equipeId: string, dto: InviteToEquipeDto, inviterId: string) {
    const equipe = await this.prisma.equipe.findUnique({
      where: { id: equipeId },
      include: {
        members: true,
        competition: { select: { id: true, status: true, title: true } },
      },
    });

    if (!equipe) {
      throw new NotFoundException('Equipe not found');
    }

    // Only leader can invite
    const leaderMember = equipe.members.find(
      (m) => m.userId === inviterId && m.role === EquipeMemberRole.LEADER,
    );
    if (!leaderMember) {
      throw new ForbiddenException('Only the team leader can send invitations');
    }

    if (equipe.members.length >= MAX_TEAM_MEMBERS) {
      throw new BadRequestException(
        `Team is already full (${MAX_TEAM_MEMBERS}/${MAX_TEAM_MEMBERS} members)`,
      );
    }

    // Find invitee by email
    const invitee = await this.prisma.user.findUnique({
      where: { email: dto.email },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    if (!invitee) {
      throw new NotFoundException('User not found with this email');
    }
    if (invitee.role !== UserRole.USER) {
      throw new BadRequestException('Only users with role USER can be invited');
    }
    if (invitee.id === inviterId) {
      throw new BadRequestException('You cannot invite yourself');
    }

    // Check invitee is not already in a team for this competition
    const existingMembership = await this.prisma.equipeMember.findFirst({
      where: {
        userId: invitee.id,
        equipe: { competitionId: equipe.competitionId },
      },
    });
    if (existingMembership) {
      throw new ConflictException(
        'This user is already in a team for this competition',
      );
    }

    // Check invitee is not already a solo participant
    const existingParticipation =
      await this.prisma.competitionParticipant.findUnique({
        where: {
          competitionId_userId: {
            competitionId: equipe.competitionId,
            userId: invitee.id,
          },
        },
      });
    if (existingParticipation && !existingParticipation.equipeId) {
      throw new ConflictException(
        'This user is in the solo waiting pool. They must leave it first.',
      );
    }

    // Check no pending invitation already exists
    const existingInvite = await this.prisma.equipeInvitation.findUnique({
      where: {
        equipeId_inviteeId: { equipeId, inviteeId: invitee.id },
      },
    });
    if (existingInvite && existingInvite.status === EquipeInvitationStatus.PENDING) {
      throw new ConflictException('An invitation is already pending for this user');
    }

    // Create or update invitation
    const invitation = existingInvite
      ? await this.prisma.equipeInvitation.update({
          where: { id: existingInvite.id },
          data: { status: EquipeInvitationStatus.PENDING },
        })
      : await this.prisma.equipeInvitation.create({
          data: {
            equipeId,
            inviterId,
            inviteeId: invitee.id,
            status: EquipeInvitationStatus.PENDING,
          },
        });

    // Create a notification for the invitee
    await this.prisma.notification.create({
      data: {
        userId: invitee.id,
        type: 'EQUIPE_INVITATION',
        title: `Invitation à rejoindre l'équipe "${equipe.name}"`,
        body: `Vous avez été invité(e) à rejoindre l'équipe "${equipe.name}" pour le hackathon "${equipe.competition.title}".`,
        competitionId: equipe.competitionId,
      },
    });

    return {
      message: `Invitation sent to ${invitee.firstName} ${invitee.lastName}`,
      invitation,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // ACCEPT / DECLINE INVITATION
  // ─────────────────────────────────────────────────────────────────

  async acceptInvitation(invitationId: string, userId: string) {
    const invitation = await this.prisma.equipeInvitation.findUnique({
      where: { id: invitationId },
      include: {
        equipe: {
          include: {
            members: true,
            competition: { select: { id: true, status: true } },
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.inviteeId !== userId) {
      throw new ForbiddenException('This invitation is not for you');
    }
    if (invitation.status !== EquipeInvitationStatus.PENDING) {
      throw new BadRequestException(
        `Invitation is already ${invitation.status.toLowerCase()}`,
      );
    }

    const equipe = invitation.equipe;

    if (equipe.members.length >= MAX_TEAM_MEMBERS) {
      // Auto-decline since team is full
      await this.prisma.equipeInvitation.update({
        where: { id: invitationId },
        data: { status: EquipeInvitationStatus.EXPIRED },
      });
      throw new BadRequestException(
        `Team is already full (${MAX_TEAM_MEMBERS}/${MAX_TEAM_MEMBERS} members)`,
      );
    }

    // Check user is not already in another team
    const existingMembership = await this.prisma.equipeMember.findFirst({
      where: {
        userId,
        equipe: { competitionId: equipe.competitionId },
      },
    });
    if (existingMembership) {
      throw new ConflictException(
        'You are already in a team for this competition',
      );
    }

    const existingParticipation =
      await this.prisma.competitionParticipant.findUnique({
        where: {
          competitionId_userId: {
            competitionId: equipe.competitionId,
            userId,
          },
        },
      });
    if (existingParticipation?.equipeId) {
      throw new ConflictException(
        'You are already registered in this competition with a team.',
      );
    }

    const hadPriorParticipation = !!existingParticipation;

    // Accept in a transaction
    await this.prisma.$transaction(async (tx) => {
      // Update invitation status
      await tx.equipeInvitation.update({
        where: { id: invitationId },
        data: { status: EquipeInvitationStatus.ACCEPTED },
      });

      // Add member
      await tx.equipeMember.create({
        data: {
          equipeId: equipe.id,
          userId,
          role: EquipeMemberRole.MEMBER,
        },
      });

      await tx.competitionParticipant.upsert({
        where: {
          competitionId_userId: {
            competitionId: equipe.competitionId,
            userId,
          },
        },
        create: {
          competitionId: equipe.competitionId,
          userId,
          equipeId: equipe.id,
          status: ParticipantStatus.JOINED,
          hackathonFaceUrl: '/uploads/hackathon-faces/default.png',
        },
        update: {
          equipeId: equipe.id,
          status: ParticipantStatus.JOINED,
        },
      });

      // Ensure team checkpoint submissions exist
      await this.ensureCheckpointSubmissionsForEquipe(
        equipe.id,
        equipe.competitionId,
        tx,
      );

      if (!hadPriorParticipation) {
        await tx.user.update({
          where: { id: userId },
          data: { totalChallenges: { increment: 1 } },
        });
      }

      // At max size: expire pending invites (status READY is set only by leader via markGroupReady)
      const newMemberCount = equipe.members.length + 1;
      if (newMemberCount >= MAX_TEAM_MEMBERS) {
        await tx.equipeInvitation.updateMany({
          where: {
            equipeId: equipe.id,
            status: EquipeInvitationStatus.PENDING,
          },
          data: { status: EquipeInvitationStatus.EXPIRED },
        });
      }
    });

    // Ajouter le nouveau membre au canal de chat de l'équipe
    void this.streamService
      .ensureTeamMember(equipe.id, equipe.competitionId, userId)
      .catch((err) =>
        this.logger.warn(
          `Failed to add member to team chat channel for equipe ${equipe.id}: ${err?.message ?? err}`,
        ),
      );

    return this.getEquipeById(equipe.id);
  }

  async declineInvitation(invitationId: string, userId: string) {
    const invitation = await this.prisma.equipeInvitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation not found');
    }
    if (invitation.inviteeId !== userId) {
      throw new ForbiddenException('This invitation is not for you');
    }
    if (invitation.status !== EquipeInvitationStatus.PENDING) {
      throw new BadRequestException(
        `Invitation is already ${invitation.status.toLowerCase()}`,
      );
    }

    await this.prisma.equipeInvitation.update({
      where: { id: invitationId },
      data: { status: EquipeInvitationStatus.DECLINED },
    });

    return { message: 'Invitation declined' };
  }

  // ─────────────────────────────────────────────────────────────────
  // MARK GROUP READY (leader only, 4–6 members)
  // ─────────────────────────────────────────────────────────────────

  async markGroupReady(equipeId: string, userId: string) {
    const equipe = await this.prisma.equipe.findUnique({
      where: { id: equipeId },
      include: {
        members: true,
        competition: { select: { id: true, status: true } },
      },
    });

    if (!equipe) {
      throw new NotFoundException('Equipe not found');
    }

    const isLeader = equipe.members.some(
      (m) => m.userId === userId && m.role === EquipeMemberRole.LEADER,
    );
    if (!isLeader) {
      throw new ForbiddenException(
        'Only the team leader can mark the group as ready',
      );
    }

    if (equipe.status === EquipeStatus.READY) {
      return this.getEquipeById(equipeId);
    }

    if (equipe.status !== EquipeStatus.FORMING) {
      throw new BadRequestException(
        'Group can only be finalized from FORMING status',
      );
    }

    const n = equipe.members.length;
    if (n < MIN_TEAM_MEMBERS || n > MAX_TEAM_MEMBERS) {
      throw new BadRequestException(
        `Team must have between ${MIN_TEAM_MEMBERS} and ${MAX_TEAM_MEMBERS} members to be marked ready (currently ${n}).`,
      );
    }

    if (
      equipe.competition.status !== CompetitionStatus.OPEN_FOR_ENTRY &&
      equipe.competition.status !== CompetitionStatus.RUNNING
    ) {
      throw new BadRequestException(
        'Competition is not open; cannot finalize team roster',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.equipe.update({
        where: { id: equipeId },
        data: { status: EquipeStatus.READY },
      });
      await tx.equipeInvitation.updateMany({
        where: {
          equipeId,
          status: EquipeInvitationStatus.PENDING,
        },
        data: { status: EquipeInvitationStatus.EXPIRED },
      });
    });

    return this.getEquipeById(equipeId);
  }

  // ─────────────────────────────────────────────────────────────────
  // REMOVE MEMBER (leader only)
  // ─────────────────────────────────────────────────────────────────

  async removeMemberFromEquipe(
    equipeId: string,
    targetUserId: string,
    leaderId: string,
  ) {
    const equipe = await this.prisma.equipe.findUnique({
      where: { id: equipeId },
      include: {
        members: true,
        competition: { select: { id: true, status: true } },
      },
    });

    if (!equipe) {
      throw new NotFoundException('Equipe not found');
    }

    if (equipe.status === EquipeStatus.PARTICIPATING) {
      throw new BadRequestException(
        'Cannot remove members while the team is in PARTICIPATING status',
      );
    }

    if (
      equipe.status !== EquipeStatus.FORMING &&
      equipe.status !== EquipeStatus.READY
    ) {
      throw new BadRequestException(
        'Members can only be removed while the team is FORMING or READY',
      );
    }

    const isLeader = equipe.members.some(
      (m) => m.userId === leaderId && m.role === EquipeMemberRole.LEADER,
    );
    if (!isLeader) {
      throw new ForbiddenException(
        'Only the team leader can remove a member',
      );
    }

    if (targetUserId === leaderId) {
      throw new BadRequestException(
        'You cannot remove yourself as leader',
      );
    }

    const targetMembership = equipe.members.find(
      (m) => m.userId === targetUserId,
    );
    if (!targetMembership) {
      throw new NotFoundException('User is not a member of this team');
    }

    if (targetMembership.role === EquipeMemberRole.LEADER) {
      throw new BadRequestException('Cannot remove the team leader');
    }

    const remainingAfter = equipe.members.length - 1;
    const shouldDemoteReady =
      equipe.status === EquipeStatus.READY &&
      remainingAfter < MIN_TEAM_MEMBERS;

    await this.prisma.$transaction(async (tx) => {
      await tx.equipeMember.delete({
        where: { id: targetMembership.id },
      });

      await tx.competitionParticipant.updateMany({
        where: {
          competitionId: equipe.competitionId,
          userId: targetUserId,
        },
        data: { equipeId: null },
      });

      if (shouldDemoteReady) {
        await tx.equipe.update({
          where: { id: equipeId },
          data: { status: EquipeStatus.FORMING },
        });
      }
    });

    void this.streamService
      .removeTeamChannelMember(equipeId, equipe.competitionId, targetUserId)
      .catch((err) =>
        this.logger.warn(
          `Failed to remove user from team chat channel (equipe ${equipeId}): ${err?.message ?? err}`,
        ),
      );

    return this.getEquipeById(equipeId);
  }

  async getMyInvitations(userId: string) {
    const invitations = await this.prisma.equipeInvitation.findMany({
      where: {
        inviteeId: userId,
        status: EquipeInvitationStatus.PENDING,
      },
      include: {
        equipe: {
          include: {
            competition: {
              select: { id: true, title: true, status: true, specialty: true },
            },
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatarUrl: true,
                  },
                },
              },
            },
            _count: { select: { members: true } },
          },
        },
        inviter: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { invitations, total: invitations.length };
  }

  // ─────────────────────────────────────────────────────────────────
  // JOIN SOLO (waiting pool)
  // ─────────────────────────────────────────────────────────────────

  async joinSolo(competitionId: string, userId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
    });
    if (!competition) {
      throw new NotFoundException('Competition not found');
    }
    if (
      competition.status !== CompetitionStatus.OPEN_FOR_ENTRY &&
      competition.status !== CompetitionStatus.RUNNING
    ) {
      throw new BadRequestException('Competition is not open for registration');
    }

    // Check not already in a team
    const existingMembership = await this.prisma.equipeMember.findFirst({
      where: {
        userId,
        equipe: { competitionId },
      },
    });
    if (existingMembership) {
      throw new ConflictException(
        'You are already in a team for this competition',
      );
    }

    // Check not already registered
    const existingParticipation =
      await this.prisma.competitionParticipant.findUnique({
        where: { competitionId_userId: { competitionId, userId } },
      });
    if (existingParticipation) {
      throw new ConflictException(
        'You are already registered in this competition',
      );
    }

    // Check capacity
    if (competition.maxParticipants !== null) {
      const currentCount = await this.prisma.competitionParticipant.count({
        where: { competitionId, status: ParticipantStatus.JOINED },
      });
      if (currentCount >= competition.maxParticipants) {
        throw new BadRequestException(
          'This competition has reached its maximum participant limit',
        );
      }
    }

    // Create participant without equipeId (solo waiting pool)
    const participant = await this.prisma.$transaction(async (tx) => {
      const p = await tx.competitionParticipant.create({
        data: {
          competitionId,
          userId,
          equipeId: null,
          status: ParticipantStatus.JOINED,
          hackathonFaceUrl: '/uploads/hackathon-faces/default.png',
        },
      });

      await tx.user.update({
        where: { id: userId },
        data: { totalChallenges: { increment: 1 } },
      });

      return p;
    });

    return {
      message:
        "Vous avez rejoint la file d'attente solo. Vous serez automatiquement assigné à une équipe.",
      participant,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // AUTO-ASSIGN SOLO USERS TO EQUIPES
  // ─────────────────────────────────────────────────────────────────

  async autoAssignSoloUsers(competitionId: string) {
    const competition = await this.prisma.competition.findUnique({
      where: { id: competitionId },
      select: { id: true, title: true, status: true },
    });
    if (!competition) {
      throw new NotFoundException('Competition not found');
    }

    // Get all solo participants (no equipeId)
    const soloParticipants = await this.prisma.competitionParticipant.findMany({
      where: {
        competitionId,
        equipeId: null,
        status: ParticipantStatus.JOINED,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (soloParticipants.length === 0) {
      return { message: 'No solo participants to assign', teamsCreated: 0 };
    }

    // Shuffle for randomness
    const shuffled = [...soloParticipants].sort(() => Math.random() - 0.5);

    const teamsCreated: string[] = [];

    // Group into chunks of up to MAX_TEAM_MEMBERS (solo auto-assign)
    for (let i = 0; i < shuffled.length; i += MAX_TEAM_MEMBERS) {
      const chunk = shuffled.slice(i, i + MAX_TEAM_MEMBERS);

      // Pick random leader
      const leaderIndex = Math.floor(Math.random() * chunk.length);

      const equipe = await this.prisma.$transaction(async (tx) => {
        const teamNumber = Math.floor(i / MAX_TEAM_MEMBERS) + 1;
        const newEquipe = await tx.equipe.create({
          data: {
            name: `Équipe Auto #${teamNumber}`,
            competitionId,
            status:
              chunk.length >= MIN_TEAM_MEMBERS &&
              chunk.length <= MAX_TEAM_MEMBERS
                ? EquipeStatus.READY
                : EquipeStatus.FORMING,
            isAutoFormed: true,
          },
        });

        // Create members and update participants
        for (let j = 0; j < chunk.length; j++) {
          const participant = chunk[j];
          const role =
            j === leaderIndex
              ? EquipeMemberRole.LEADER
              : EquipeMemberRole.MEMBER;

          await tx.equipeMember.create({
            data: {
              equipeId: newEquipe.id,
              userId: participant.userId,
              role,
            },
          });

          await tx.competitionParticipant.update({
            where: { id: participant.id },
            data: { equipeId: newEquipe.id },
          });
        }

        // Ensure team checkpoint submissions exist
        await this.ensureCheckpointSubmissionsForEquipe(
          newEquipe.id,
          competitionId,
          tx,
        );

        return newEquipe;
      });

      teamsCreated.push(equipe.id);

      // Créer le canal de chat privé pour l'équipe auto-assignée
      const memberUserIds = chunk.map((p) => p.userId);
      void this.streamService
        .createTeamChannel(
          equipe.id,
          competitionId,
          equipe.name,
          memberUserIds,
        )
        .catch((err) =>
          this.logger.warn(
            `Failed to create team chat for auto-assigned equipe ${equipe.id}: ${err?.message ?? err}`,
          ),
        );

      // Send notifications to all members
      for (const participant of chunk) {
        await this.prisma.notification.create({
          data: {
            userId: participant.userId,
            type: 'EQUIPE_AUTO_ASSIGNED',
            title: `Vous avez été assigné à une équipe`,
            body: `Vous avez été automatiquement assigné à une équipe pour le hackathon "${competition.title}".`,
            competitionId,
          },
        });
      }
    }

    this.logger.log(
      `Auto-assigned ${shuffled.length} solo users into ${teamsCreated.length} teams for competition ${competitionId}`,
    );

    return {
      message: `${teamsCreated.length} teams created from ${shuffled.length} solo participants`,
      teamsCreated: teamsCreated.length,
      teamIds: teamsCreated,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // SEARCH USERS FOR INVITE
  // ─────────────────────────────────────────────────────────────────

  async searchUsers(query: string, competitionId?: string) {
    const where: any = {
      role: UserRole.USER,
      isBanned: false,
      OR: [
        { firstName: { contains: query, mode: 'insensitive' } },
        { lastName: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
      ],
    };

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
        mainSpecialty: true,
      },
      take: 10,
    });

    // If competitionId provided, mark users who are already in a team
    if (competitionId) {
      const teamedUserIds = await this.prisma.equipeMember.findMany({
        where: { equipe: { competitionId } },
        select: { userId: true },
      });
      const teamedSet = new Set(teamedUserIds.map((m) => m.userId));

      const soloParticipantIds =
        await this.prisma.competitionParticipant.findMany({
          where: { competitionId, equipeId: null },
          select: { userId: true },
        });
      const soloSet = new Set(soloParticipantIds.map((p) => p.userId));

      return users.map((u) => ({
        ...u,
        alreadyInTeam: teamedSet.has(u.id),
        inSoloQueue: soloSet.has(u.id),
      }));
    }

    return users;
  }

  // ─────────────────────────────────────────────────────────────────
  // ADMIN — suppression équipe complète
  // ─────────────────────────────────────────────────────────────────

  async adminDeleteEquipe(equipeId: string) {
    const equipe = await this.prisma.equipe.findUnique({
      where: { id: equipeId },
      select: { id: true, competitionId: true, name: true },
    });
    if (!equipe) {
      throw new NotFoundException('Equipe not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.competitionParticipant.updateMany({
        where: { equipeId: equipe.id },
        data: { equipeId: null },
      });
      await tx.equipe.delete({ where: { id: equipe.id } });
    });

    void this.streamService
      .archiveTeamChannels(equipe.competitionId, [equipe.id])
      .catch((err) =>
        this.logger.warn(
          `Failed to archive team channel after admin delete ${equipe.id}: ${err?.message ?? err}`,
        ),
      );

    return {
      deleted: true,
      id: equipe.id,
      name: equipe.name,
      competitionId: equipe.competitionId,
    };
  }
}
