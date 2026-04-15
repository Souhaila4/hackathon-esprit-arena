import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiQuery,
} from '@nestjs/swagger';
import { EquipeService } from './equipe.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { CreateEquipeDto, InviteToEquipeDto } from './equipe.dto';

@ApiTags('Equipes')
@ApiBearerAuth('access-token')
@Controller()
@UseGuards(JwtAuthGuard)
export class EquipeController {
  constructor(private readonly equipeService: EquipeService) {}

  // ─────────────────────────────────────────────────────────────────
  // EQUIPE CRUD
  // ─────────────────────────────────────────────────────────────────

  @Post('equipes')
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new equipe for a competition' })
  @ApiBody({ type: CreateEquipeDto })
  @ApiResponse({ status: 201, description: 'Equipe created successfully' })
  @ApiResponse({ status: 409, description: 'Already in a team' })
  async createEquipe(
    @Body() dto: CreateEquipeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.equipeService.createEquipe(dto, userId);
  }

  @Get('equipes/my-equipe/:competitionId')
  @ApiOperation({ summary: 'Get my equipe for a competition' })
  @ApiParam({ name: 'competitionId', description: 'Competition ID' })
  @ApiResponse({ status: 200, description: 'Equipe details or null' })
  async getMyEquipe(
    @Param('competitionId') competitionId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.equipeService.getMyEquipe(competitionId, userId);
  }

  @Get('equipes/competition/:competitionId')
  @ApiOperation({ summary: 'List all equipes for a competition' })
  @ApiParam({ name: 'competitionId', description: 'Competition ID' })
  @ApiResponse({ status: 200, description: 'List of equipes' })
  async getCompetitionEquipes(
    @Param('competitionId') competitionId: string,
  ) {
    return this.equipeService.getCompetitionEquipes(competitionId);
  }

  @Get('equipes/search-users')
  @ApiOperation({ summary: 'Search users to invite to a team' })
  @ApiQuery({ name: 'query', description: 'Search by name or email' })
  @ApiQuery({ name: 'competitionId', required: false })
  @ApiResponse({ status: 200, description: 'List of matching users' })
  async searchUsers(
    @Query('query') query: string,
    @Query('competitionId') competitionId?: string,
  ) {
    return this.equipeService.searchUsers(query, competitionId);
  }

  @Get('equipes/:id')
  @ApiOperation({ summary: 'Get equipe details by ID' })
  @ApiParam({ name: 'id', description: 'Equipe ID' })
  @ApiResponse({ status: 200, description: 'Equipe details with members' })
  @ApiResponse({ status: 404, description: 'Equipe not found' })
  async getEquipe(@Param('id') equipeId: string) {
    return this.equipeService.getEquipeById(equipeId);
  }

  // ─────────────────────────────────────────────────────────────────
  // INVITATIONS
  // ─────────────────────────────────────────────────────────────────

  @Post('equipes/:id/mark-ready')
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark team as ready (leader only, 4–6 members including leader)',
  })
  @ApiParam({ name: 'id', description: 'Equipe ID' })
  @ApiResponse({ status: 200, description: 'Team marked READY' })
  @ApiResponse({
    status: 400,
    description: 'Invalid member count or competition closed',
  })
  @ApiResponse({ status: 403, description: 'Not the team leader' })
  async markGroupReady(
    @Param('id') equipeId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.equipeService.markGroupReady(equipeId, userId);
  }

  @Post('equipes/:id/invite')
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite a user to your equipe (leader only)' })
  @ApiParam({ name: 'id', description: 'Equipe ID' })
  @ApiBody({ type: InviteToEquipeDto })
  @ApiResponse({ status: 201, description: 'Invitation sent' })
  @ApiResponse({ status: 403, description: 'Not the team leader' })
  async inviteToEquipe(
    @Param('id') equipeId: string,
    @Body() dto: InviteToEquipeDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.equipeService.inviteToEquipe(equipeId, dto, userId);
  }

  @Get('equipe-invitations/my-invitations')
  @ApiOperation({ summary: 'Get my pending team invitations' })
  @ApiResponse({ status: 200, description: 'List of pending invitations' })
  async getMyInvitations(@CurrentUser('id') userId: string) {
    return this.equipeService.getMyInvitations(userId);
  }

  @Post('equipe-invitations/:id/accept')
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept a team invitation' })
  @ApiParam({ name: 'id', description: 'Invitation ID' })
  @ApiResponse({ status: 200, description: 'Invitation accepted' })
  @ApiResponse({ status: 409, description: 'Already in a team' })
  async acceptInvitation(
    @Param('id') invitationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.equipeService.acceptInvitation(invitationId, userId);
  }

  @Post('equipe-invitations/:id/decline')
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Decline a team invitation' })
  @ApiParam({ name: 'id', description: 'Invitation ID' })
  @ApiResponse({ status: 200, description: 'Invitation declined' })
  async declineInvitation(
    @Param('id') invitationId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.equipeService.declineInvitation(invitationId, userId);
  }

  // ─────────────────────────────────────────────────────────────────
  // SOLO JOIN + AUTO-ASSIGN
  // ─────────────────────────────────────────────────────────────────

  @Post('competitions/:id/join-solo')
  @UseGuards(RolesGuard)
  @Roles(UserRole.USER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Join competition without a team (solo queue)' })
  @ApiParam({ name: 'id', description: 'Competition ID' })
  @ApiResponse({ status: 201, description: 'Added to solo waiting pool' })
  @ApiResponse({ status: 409, description: 'Already registered' })
  async joinSolo(
    @Param('id') competitionId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.equipeService.joinSolo(competitionId, userId);
  }

  @Post('equipes/auto-assign/:competitionId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Auto-assign solo users to random teams (Admin only)',
  })
  @ApiParam({ name: 'competitionId', description: 'Competition ID' })
  @ApiResponse({ status: 200, description: 'Solo users assigned to teams' })
  async autoAssign(
    @Param('competitionId') competitionId: string,
  ) {
    return this.equipeService.autoAssignSoloUsers(competitionId);
  }
}
