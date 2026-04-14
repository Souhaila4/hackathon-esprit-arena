import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Param,
  Patch,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestCompanyRoleDto } from './dto/company-request.dto';
import { UpdateWalletDto } from './dto/update-wallet.dto';

@ApiTags('user')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('leaderboard')
  @ApiOperation({ summary: 'Classement public des utilisateurs par XP' })
  @ApiResponse({
    status: 200,
    description: 'Liste des utilisateurs classés par XP',
  })
  async getLeaderboard() {
    return this.userService.getLeaderboard();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtenir un profil utilisateur public' })
  @ApiResponse({ status: 200, description: 'Le profil utilisateur' })
  async getPublicProfile(@Param('id') id: string) {
    return this.userService.findById(id);
  }

  @Post('request-company-role')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Demander le rôle entreprise (Company)' })
  @ApiBody({ type: RequestCompanyRoleDto })
  @ApiResponse({ status: 201, description: 'Demande envoyée' })
  @ApiResponse({
    status: 409,
    description: 'Vous avez déjà une demande en cours',
  })
  async requestCompanyRole(
    @CurrentUser('id') userId: string,
    @Body() dto: RequestCompanyRoleDto,
  ) {
    return this.userService.requestCompanyRole(userId, dto);
  }

  @Patch('wallet')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register your Hedera wallet',
    description:
      'Save your Hedera account ID so that minted certificate NFTs are automatically transferred to your wallet.',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet registered',
    schema: { example: { id: '...', hederaAccountId: '0.0.123456' } },
  })
  @ApiResponse({ status: 400, description: 'Invalid Hedera account ID format' })
  async updateWallet(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateWalletDto,
  ) {
    return this.userService.updateWallet(userId, dto.hederaAccountId);
  }
}
