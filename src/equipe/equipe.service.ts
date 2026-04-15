import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
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

@Injectable()
export class EquipeService {
  private readonly logger = new Logger(EquipeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly streamService: StreamService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  // CREATE EQUIPE
  // ─────────────────────────────────────────────────────────────────

  async createEquipe(dto: CreateEquipeDto, userId: string) {
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

    // Check user is not already a solo participant
    const existingParticipation =
      await this.prisma.competitionParticipant.findUnique({
        where: {
          competitionId_userId: {
            competitionId: dto.competitionId,
            userId,
          },
        },
      });
    if (existingParticipation) {
      throw new ConflictException(
        'You are already registered in this competition. Leave solo queue first.',
      );
    }

    // Create equipe + leader membership + competition participant in a transaction
    const equipe = await this.prisma.$transaction(async (tx) => {
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

      // Create competition participant for the leader
      const participant = await tx.competitionParticipant.create({
        data: {
          competitionId: dto.competitionId,
          userId,
          equipeId: newEquipe.id,
          status: ParticipantStatus.JOINED,
          hackathonFaceUrl: '/uploads/hackathon-faces/default.png',
        },
      });

      // Create checkpoint submissions for the participant
      const checkpoints = await tx.competitionCheckpoint.findMany({
        where: { competitionId: dto.competitionId },
        select: { id: true },
        orderBy: { order: 'asc' },
      });
      if (checkpoints.length > 0) {
        await tx.checkpointSubmission.createMany({
          data: checkpoints.map((cp) => ({
            checkpointId: cp.id,
            participantId: participant.id,
            status: CheckpointStatus.PENDING,
          })),
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: { totalChallenges: { increment: 1 } },
      });

      return newEquipe;
    });

    // Créer le canal de chat privé pour l'équipe
    void this.streamService
      .createTeamChannel(equipe.id, dto.competitionId, dto.name, [userId])
      .catch((err) =>
        this.logger.warn(
          `Failed to create team chat channel for equipe ${equipe.id}: ${err?.message ?? err}`,
        ),
      );

    return this.getEquipeById(equipe.id);
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

    // Check not already a solo participant
    const existingParticipation =
      await this.prisma.competitionParticipant.findUnique({
        where: {
          competitionId_userId: {
            competitionId: equipe.competitionId,
            userId,
          },
        },
      });
    if (existingParticipation && !existingParticipation.equipeId) {
      throw new ConflictException(
        'You are in the solo waiting pool. Leave it before accepting a team invite.',
      );
    }

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

      // Create competition participant
      const participant = await tx.competitionParticipant.create({
        data: {
          competitionId: equipe.competitionId,
          userId,
          equipeId: equipe.id,
          status: ParticipantStatus.JOINED,
          hackathonFaceUrl: '/uploads/hackathon-faces/default.png',
        },
      });

      // Create checkpoint submissions
      const checkpoints = await tx.competitionCheckpoint.findMany({
        where: { competitionId: equipe.competitionId },
        select: { id: true },
        orderBy: { order: 'asc' },
      });
      if (checkpoints.length > 0) {
        await tx.checkpointSubmission.createMany({
          data: checkpoints.map((cp) => ({
            checkpointId: cp.id,
            participantId: participant.id,
            status: CheckpointStatus.PENDING,
          })),
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: { totalChallenges: { increment: 1 } },
      });

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

      const checkpoints = await tx.competitionCheckpoint.findMany({
        where: { competitionId },
        select: { id: true },
        orderBy: { order: 'asc' },
      });
      if (checkpoints.length > 0) {
        await tx.checkpointSubmission.createMany({
          data: checkpoints.map((cp) => ({
            checkpointId: cp.id,
            participantId: p.id,
            status: CheckpointStatus.PENDING,
          })),
        });
      }

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
}
