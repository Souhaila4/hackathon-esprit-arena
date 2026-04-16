import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminService } from './admin.service';
import { ReviewCompanyRequestDto } from './dto/review-company-request.dto';
import { SendPreselectedEmailDto } from './dto/send-preselected-email.dto';
import { CompetitionService } from '../competition/competition.service';
import { EquipeService } from '../equipe/equipe.service';

@ApiTags('admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth('access-token')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly competitionService: CompetitionService,
    private readonly equipeService: EquipeService,
  ) {}

  @Patch('users/:id/role')
  @ApiOperation({ summary: "Changer le rôle d'un utilisateur (Admin only)" })
  @ApiParam({ name: 'id', description: "ID de l'utilisateur" })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        role: { type: 'string', enum: ['USER', 'ADMIN', 'COMPANY'] },
      },
    },
  })
  @ApiResponse({ status: 200, description: "Rôle de l'utilisateur mis à jour" })
  async updateUserRole(
    @Param('id') userId: string,
    @Body('role') role: UserRole,
  ) {
    return this.adminService.updateUserRole(userId, role);
  }

  @Get('company-requests')
  @ApiOperation({
    summary: 'Liste les demandes du rôle entreprise (Admin only)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
  })
  @ApiResponse({ status: 200 })
  async getCompanyRequests(@Query('status') status?: string) {
    return this.adminService.getCompanyRequests(status as any);
  }

  @Patch('company-requests/:id/review')
  @ApiOperation({
    summary: 'Accepter ou refuser une demande de rôle entreprise',
  })
  @ApiParam({ name: 'id', description: 'ID de la demande' })
  @ApiBody({ type: ReviewCompanyRequestDto })
  async reviewCompanyRequest(
    @Param('id') requestId: string,
    @Body() dto: ReviewCompanyRequestDto,
  ) {
    return this.adminService.reviewCompanyRequest(requestId, dto.status);
  }

  @Get('hackathons/equipes')
  @ApiOperation({
    summary:
      'Liste tous les hackathons avec équipes et membres (emails) — réservé admin',
  })
  @ApiResponse({ status: 200, description: 'hackathons avec equipes et membres' })
  async getAllHackathonEquipes() {
    return this.adminService.getAllHackathonEquipesAdmin();
  }

  @Delete('equipes/:equipeId')
  @ApiOperation({
    summary:
      'Supprime une équipe entière (détache les participants, archive le chat) — admin',
  })
  @ApiParam({ name: 'equipeId', description: 'ID MongoDB de l’équipe' })
  @ApiResponse({ status: 200, description: 'Équipe supprimée' })
  @ApiResponse({ status: 404, description: 'Équipe introuvable' })
  async deleteEquipe(@Param('equipeId') equipeId: string) {
    return this.equipeService.adminDeleteEquipe(equipeId);
  }

  @Get('dashboard/stats')
  @ApiOperation({ summary: 'Statistiques plateforme (réservé admin)' })
  @ApiResponse({
    status: 200,
    description: 'Stats utilisateurs, spécialités, etc.',
  })
  @ApiResponse({ status: 403, description: 'Admin only' })
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('users/recent')
  @ApiOperation({ summary: 'Derniers utilisateurs inscrits' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Max 50',
  })
  @ApiResponse({ status: 200, description: 'Liste des derniers utilisateurs' })
  async getRecentUsers(@Query('limit') limit?: string) {
    const n = limit ? Math.min(parseInt(limit, 10) || 10, 50) : 10;
    return this.adminService.getRecentUsers(n);
  }

  @Get('users')
  @ApiOperation({ summary: 'Liste utilisateurs avec recherche et pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Email, prénom ou nom',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: UserRole,
    description: 'Filtrer par rôle',
  })
  @ApiResponse({ status: 200, description: 'users, total, limit, offset' })
  async getUsers(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
    @Query('role') role?: UserRole,
  ) {
    return this.adminService.getUsers({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      search,
      role,
    });
  }

  @Post('competitions/:competitionId/preselected/send-email')
  @ApiOperation({
    summary:
      'Envoyer un e-mail aux participants présélectionnés (top score) d’un hackathon',
    description:
      'Cible les N meilleurs participants ayant soumis et un score (comme GET /competitions/:id/top-participants). Variables dans le sujet et le corps HTML : {{firstName}}, {{competitionTitle}}.',
  })
  @ApiParam({
    name: 'competitionId',
    description: 'ID MongoDB de la compétition',
  })
  @ApiBody({ type: SendPreselectedEmailDto })
  @ApiResponse({
    status: 200,
    description: 'sent, total, failedEmails',
  })
  async sendPreselectedEmail(
    @Param('competitionId') competitionId: string,
    @Body() dto: SendPreselectedEmailDto,
  ) {
    return this.competitionService.sendEmailToPreselectedParticipants(
      competitionId,
      dto.subject,
      dto.htmlBody,
      dto.limit,
    );
  }

  @Post('n8n/webhook-test')
  @ApiOperation({
    summary: 'Déclencher le webhook n8n (test) — proxy pour éviter CORS',
  })
  @ApiResponse({
    status: 200,
    description: 'success: true si le workflow a répondu',
  })
  @ApiResponse({
    status: 200,
    description: 'success: false + message en cas d’erreur ou timeout',
  })
  async triggerN8nWebhookTest() {
    return this.adminService.triggerN8nWebhookTest();
  }
}
