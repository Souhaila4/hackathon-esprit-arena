import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { WalletService } from './wallet.service';
import { MintCoinsDto } from './dto/mint-coins.dto';

@ApiTags('wallet')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  // ─────────────────────────────────────────────────────────────────
  //  USER: Get my wallet info + transaction history
  // ─────────────────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({
    summary: 'Get my Arena Coin wallet info',
    description:
      'Returns current off-chain balance, Hedera account ID, and last 50 transactions.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        userId: '...',
        walletBalance: 500,
        hederaAccountId: '0.0.123456',
        tokenId: '0.0.987654',
        hashScanUrl: 'https://hashscan.io/testnet/account/0.0.123456',
        transactions: [],
      },
    },
  })
  async getMyWallet(@CurrentUser('id') userId: string) {
    return this.walletService.getWalletInfo(userId);
  }

  // ─────────────────────────────────────────────────────────────────
  //  ADMIN: Mint coins into a company's wallet
  // ─────────────────────────────────────────────────────────────────

  @Post('admin/mint')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Admin: Mint Arena Coins to a company wallet',
    description:
      "Mints new Arena Coin tokens and transfers them to the company's Hedera wallet. " +
      'The company must have already registered their hederaAccountId via PATCH /user/wallet.',
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        success: true,
        userId: '...',
        recipientAccountId: '0.0.123456',
        amount: 500,
        newBalance: 1000,
        transactionLogId: '...',
        hederaTransactionId: '0.0.7359554@1743295200.123456789',
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Company has no Hedera wallet registered or bad request',
  })
  async mintCoins(@Body() dto: MintCoinsDto) {
    return this.walletService.adminMintToCompany(dto.userId, dto.amount);
  }

  // ─────────────────────────────────────────────────────────────────
  //  ADMIN: View transaction history for a competition
  // ─────────────────────────────────────────────────────────────────

  @Get('competition/:competitionId/transactions')
  @UseGuards(AdminGuard)
  @ApiOperation({
    summary: 'Admin: Get Arena Coin transactions for a hackathon',
    description:
      'Lists all escrow, reward, and refund transactions linked to a competition.',
  })
  @ApiParam({
    name: 'competitionId',
    description: 'MongoDB ObjectId of the competition',
  })
  @ApiResponse({ status: 200 })
  async getCompetitionTransactions(
    @Param('competitionId') competitionId: string,
  ) {
    return this.walletService.getTransactionHistory(competitionId);
  }
}
