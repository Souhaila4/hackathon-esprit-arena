import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StreamService } from './stream.service';
import { StreamTokenDto } from './dto/stream-token.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { User } from '@prisma/client';
import { canAccessRoom, getAllRoomsWithAccess } from './room-specialty.config';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('stream')
@Controller('stream')
export class StreamController {
  constructor(
    private readonly streamService: StreamService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get Stream user token for Chat and Video' })
  @ApiResponse({ status: 200, description: 'Returns Stream user token' })
  @ApiResponse({
    status: 400,
    description: 'Missing userId or Stream not configured',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getToken(
    @Body() dto: StreamTokenDto,
    @CurrentUser() user: User,
  ): { token: string; apiKey?: string } {
    const userId = dto?.userId?.trim() || user?.id;
    const token = this.streamService.createUserToken(userId);
    const apiKey = this.streamService.getApiKey();
    return { token, apiKey };
  }

  @Post('arena/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Rejoindre le canal Arena Live (nécessaire pour envoyer des messages)',
  })
  @ApiResponse({ status: 201, description: 'Utilisateur ajouté au canal' })
  @ApiResponse({ status: 400, description: 'Stream not configured' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async arenaJoin(@CurrentUser() user: User): Promise<{ ok: boolean }> {
    await this.streamService.ensureArenaMember(user.id);
    return { ok: true };
  }

  @Get('rooms')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Toutes les salles hackathon avec indicateur canParticipate selon la spécialité',
  })
  @ApiResponse({
    status: 200,
    description:
      'Liste des salles (toutes affichées, canParticipate=true uniquement pour la spécialité)',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getRooms(@CurrentUser() user: User) {
    const rooms = getAllRoomsWithAccess(user.mainSpecialty ?? null);
    return { rooms };
  }

  @Post('room/:roomId/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: "Rejoindre une salle (hackathon) : chat + visio + partage d'écran",
  })
  @ApiResponse({ status: 201, description: 'Utilisateur ajouté à la salle' })
  @ApiResponse({ status: 400, description: 'Stream not configured' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Accès refusé : salle non autorisée pour votre spécialité',
  })
  async roomJoin(
    @Param('roomId') roomId: string,
    @CurrentUser() user: User,
  ): Promise<{ ok: boolean }> {
    if (!canAccessRoom(roomId, user.mainSpecialty ?? null)) {
      throw new ForbiddenException(
        "Vous ne pouvez accéder qu'à la salle correspondant à votre spécialité. Définissez votre spécialité dans Paramètres si besoin.",
      );
    }
    await this.streamService.ensureRoomMember(user.id, roomId);
    return { ok: true };
  }

  // ─────────────────────────────────────────────────────────────────
  // TEAM CHAT — Private channel per equipe per competition
  // ─────────────────────────────────────────────────────────────────

  @Post('team/:equipeId/comp/:competitionId/join')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      "Rejoindre le canal de chat privé de son équipe pour un hackathon donné",
  })
  @ApiResponse({
    status: 201,
    description: 'Utilisateur ajouté au canal de l\'équipe',
  })
  @ApiResponse({ status: 400, description: 'Stream not configured' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({
    status: 403,
    description: 'Vous ne faites pas partie de cette équipe',
  })
  async teamChatJoin(
    @Param('equipeId') equipeId: string,
    @Param('competitionId') competitionId: string,
    @CurrentUser() user: User,
  ): Promise<{ ok: boolean }> {
    // Vérifier que l'utilisateur fait bien partie de cette équipe
    const membership = await this.prisma.equipeMember.findFirst({
      where: { equipeId, userId: user.id },
    });
    if (!membership) {
      throw new ForbiddenException(
        'Vous ne faites pas partie de cette équipe',
      );
    }
    await this.streamService.ensureTeamMember(equipeId, competitionId, user.id);
    return { ok: true };
  }
}
