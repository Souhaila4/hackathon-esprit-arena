import {
  Injectable,
  Logger,
  InternalServerErrorException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  Client,
  PrivateKey,
  AccountId,
  TokenId,
  TransferTransaction,
  TokenMintTransaction,
} from '@hashgraph/sdk';
import { TransactionType, TransactionStatus } from '@prisma/client';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────────────────────────────────────────────────
  //  HELPERS — Hedera client setup
  // ─────────────────────────────────────────────────────────────────

  private buildClient(): {
    client: Client;
    operatorId: AccountId;
    operatorKey: PrivateKey;
  } {
    const accountIdStr = this.config.get<string>('HEDERA_ACCOUNT_ID')!;
    const privateKeyStr = this.config.get<string>('HEDERA_PRIVATE_KEY')!;
    const operatorId = AccountId.fromString(accountIdStr);
    const operatorKey = PrivateKey.fromStringECDSA(privateKeyStr);
    const client = Client.forTestnet();
    client.setOperator(operatorId, operatorKey);
    return { client, operatorId, operatorKey };
  }

  private get arenaTokenId(): TokenId {
    const id = this.config.get<string>('ARENA_COIN_TOKEN_ID');
    if (!id)
      throw new InternalServerErrorException(
        'ARENA_COIN_TOKEN_ID is not configured in .env',
      );
    return TokenId.fromString(id);
  }

  /** Convert human Arena Coins to Hedera atomic units (decimals=2) */
  private toAtomicUnits(amount: number): number {
    return Math.round(amount * 100);
  }

  /** Convert Hedera atomic units back to human-readable amount */
  private fromAtomicUnits(atomic: number): number {
    return atomic / 100;
  }

  // ─────────────────────────────────────────────────────────────────
  //  1. ADMIN MINT COINS → Company wallet
  //     Called by admin to credit coins into a company's Hedera wallet.
  //     This mints new tokens from the supply key and transfers them.
  // ─────────────────────────────────────────────────────────────────

  async adminMintToCompany(userId: string, amount: number) {
    // 1. Fetch company user + check they have a Hedera wallet
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        hederaAccountId: true,
        walletBalance: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.hederaAccountId) {
      throw new BadRequestException(
        'This user has not registered a Hedera wallet. Ask them to use PATCH /user/wallet first.',
      );
    }

    const tokenIdStr = this.config.get<string>('ARENA_COIN_TOKEN_ID')!;
    if (!tokenIdStr) {
      throw new InternalServerErrorException(
        'ARENA_COIN_TOKEN_ID is not configured in .env',
      );
    }

    const { client, operatorId, operatorKey } = this.buildClient();
    const tokenId = this.arenaTokenId;
    const recipientId = AccountId.fromString(user.hederaAccountId);
    const atomicAmount = this.toAtomicUnits(amount);

    let hederaTxId: string | null = null;
    let txStatus: TransactionStatus = TransactionStatus.SUCCESS;
    let errorNote: string | null = null;

    try {
      // Mint new tokens into the treasury first
      const mintTx = await new TokenMintTransaction()
        .setTokenId(tokenId)
        .setAmount(atomicAmount)
        .freezeWith(client)
        .sign(operatorKey);
      const mintSubmit = await mintTx.execute(client);
      await mintSubmit.getReceipt(client);
      this.logger.log(`Minted ${amount} ARENA to treasury`);

      // Transfer from treasury to the company's wallet
      const transferTx = await new TransferTransaction()
        .addTokenTransfer(tokenId, operatorId, -atomicAmount)
        .addTokenTransfer(tokenId, recipientId, atomicAmount)
        .freezeWith(client)
        .sign(operatorKey);

      const transferSubmit = await transferTx.execute(client);
      const receipt = await transferSubmit.getReceipt(client);
      hederaTxId = transferSubmit.transactionId.toString();

      this.logger.log(
        `Transferred ${amount} ARENA → ${user.hederaAccountId} (${String(receipt.status)})`,
      );
    } catch (err: unknown) {
      client.close();
      const msg: string = err instanceof Error ? err.message : String(err);

      if (msg.includes('TOKEN_NOT_ASSOCIATED_TO_ACCOUNT')) {
        txStatus = TransactionStatus.PENDING_ASSOCIATION;
        errorNote = `The company has not associated Arena Coin (${tokenIdStr}) with their wallet yet. Ask them to associate it in HashPack.`;
        this.logger.warn(
          `[MINT] Token not associated: ${user.hederaAccountId}`,
        );
      } else {
        txStatus = TransactionStatus.FAILED;
        errorNote = msg;
        this.logger.error('[MINT] Transfer failed', msg);
        // Log the failure then throw
        await this.logTransaction({
          senderAccountId: 'TREASURY',
          receiverAccountId: user.hederaAccountId,
          amount,
          type: TransactionType.ADMIN_MINT,
          status: txStatus,
          errorNote,
          hederaTransactionId: hederaTxId ?? undefined,
        });
        throw new InternalServerErrorException(`Failed to mint coins: ${msg}`);
      }
    }
    client.close();

    // 2. Update walletBalance in DB (our off-chain mirror)
    const isSuccess = txStatus === TransactionStatus.SUCCESS;
    if (isSuccess) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { walletBalance: { increment: amount } },
      });
    }

    // 3. Log the transaction
    const log = await this.logTransaction({
      senderAccountId: 'TREASURY',
      receiverAccountId: user.hederaAccountId,
      amount,
      type: TransactionType.ADMIN_MINT,
      status: txStatus,
      errorNote: errorNote ?? undefined,
      hederaTransactionId: hederaTxId ?? undefined,
    });

    return {
      success: isSuccess,
      userId,
      recipientAccountId: user.hederaAccountId,
      amount,
      newBalance: isSuccess ? user.walletBalance + amount : user.walletBalance,
      transactionLogId: log.id,
      hederaTransactionId: hederaTxId,
      ...(errorNote && { note: errorNote }),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  2. ESCROW LOCK — Company creates hackathon
  //     The company must have enough coins in their off-chain balance.
  //     We deduct from DB immediately, and log the lock on-chain.
  // ─────────────────────────────────────────────────────────────────

  async lockEscrow(
    companyUserId: string,
    amount: number,
    competitionId: string,
  ) {
    if (amount <= 0) return; // Nothing to lock

    const company = await this.prisma.user.findUnique({
      where: { id: companyUserId },
      select: { id: true, walletBalance: true, hederaAccountId: true },
    });
    if (!company) throw new NotFoundException('Company user not found');
    if (company.walletBalance < amount) {
      throw new BadRequestException(
        `Insufficient Arena Coin balance. Required: ${amount}, Available: ${company.walletBalance}`,
      );
    }

    const tokenIdStr =
      this.config.get<string>('ARENA_COIN_TOKEN_ID') ?? 'NOT_SET';

    // Deduct from company balance (coins move to platform treasury)
    await this.prisma.user.update({
      where: { id: companyUserId },
      data: { walletBalance: { decrement: amount } },
    });

    let hederaTxId: string | null = null;
    let txStatus: TransactionStatus = TransactionStatus.SUCCESS;
    let errorNote: string | null = null;

    // On-chain: transfer from company wallet → treasury (if they have hederaAccountId)
    if (company.hederaAccountId && tokenIdStr !== 'NOT_SET') {
      const { client, operatorId, operatorKey } = this.buildClient();
      const tokenId = this.arenaTokenId;
      const senderHedId = AccountId.fromString(company.hederaAccountId);
      const atomicAmount = this.toAtomicUnits(amount);

      try {
        const transferTx = await new TransferTransaction()
          .addTokenTransfer(tokenId, senderHedId, -atomicAmount)
          .addTokenTransfer(tokenId, operatorId, atomicAmount)
          .freezeWith(client)
          .sign(operatorKey); // Note: needs company to sign too — simplified for now (treasury pays)

        const submit = await transferTx.execute(client);
        await submit.getReceipt(client);
        hederaTxId = submit.transactionId.toString();
        this.logger.log(
          `Escrow locked: ${amount} ARENA from ${company.hederaAccountId} → treasury for competition ${competitionId}`,
        );
      } catch (err: unknown) {
        // Don't block competition creation — just log the failure
        const msg: string = err instanceof Error ? err.message : String(err);
        txStatus = TransactionStatus.FAILED;
        errorNote = `On-chain escrow failed (off-chain balance still deducted): ${msg}`;
        this.logger.warn(`[ESCROW] On-chain lock failed: ${msg}`);
      }
      client.close();
    } else {
      // No Hedera account or token not configured — off-chain only
      errorNote = company.hederaAccountId
        ? 'ARENA_COIN_TOKEN_ID not configured — escrow is off-chain only'
        : 'Company has no Hedera wallet — escrow is off-chain only';
      this.logger.warn(`[ESCROW] ${errorNote}`);
    }

    await this.logTransaction({
      senderAccountId: company.hederaAccountId ?? 'OFF_CHAIN',
      receiverAccountId: 'TREASURY',
      amount,
      type: TransactionType.ESCROW_LOCK,
      status: txStatus,
      competitionId,
      hederaTransactionId: hederaTxId ?? undefined,
      errorNote: errorNote ?? undefined,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  3. REWARD RELEASE — Winner declared
  //     Treasury transfers the locked coins to the winner's Hedera wallet.
  // ─────────────────────────────────────────────────────────────────

  async releaseRewardToWinner(
    winnerUserId: string,
    amount: number,
    competitionId: string,
  ) {
    if (amount <= 0) return;

    const winner = await this.prisma.user.findUnique({
      where: { id: winnerUserId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        hederaAccountId: true,
        walletBalance: true,
      },
    });
    if (!winner) throw new NotFoundException('Winner user not found');

    const tokenIdStr =
      this.config.get<string>('ARENA_COIN_TOKEN_ID') ?? 'NOT_SET';

    let hederaTxId: string | null = null;
    let txStatus: TransactionStatus = TransactionStatus.SUCCESS;
    let errorNote: string | null = null;

    // On-chain transfer: Treasury → Winner wallet
    if (winner.hederaAccountId && tokenIdStr !== 'NOT_SET') {
      const { client, operatorId, operatorKey } = this.buildClient();
      const tokenId = this.arenaTokenId;
      const recipientId = AccountId.fromString(winner.hederaAccountId);
      const atomicAmount = this.toAtomicUnits(amount);

      try {
        const transferTx = await new TransferTransaction()
          .addTokenTransfer(tokenId, operatorId, -atomicAmount)
          .addTokenTransfer(tokenId, recipientId, atomicAmount)
          .freezeWith(client)
          .sign(operatorKey);

        const submit = await transferTx.execute(client);
        await submit.getReceipt(client);
        hederaTxId = submit.transactionId.toString();
        this.logger.log(
          `Reward sent: ${amount} ARENA → ${winner.hederaAccountId}`,
        );
      } catch (err: unknown) {
        const msg: string = err instanceof Error ? err.message : String(err);
        if (msg.includes('TOKEN_NOT_ASSOCIATED_TO_ACCOUNT')) {
          txStatus = TransactionStatus.PENDING_ASSOCIATION;
          errorNote = `Winner (${winner.hederaAccountId}) has not associated Arena Coin yet. They must associate the token in HashPack and request a manual transfer.`;
        } else {
          txStatus = TransactionStatus.FAILED;
          errorNote = `On-chain reward transfer failed: ${msg}`;
        }
        this.logger.warn(`[REWARD] Transfer issue: ${errorNote}`);
      }
      client.close();
    } else {
      if (!winner.hederaAccountId) {
        txStatus = TransactionStatus.PENDING_ASSOCIATION;
        errorNote =
          'Winner has no Hedera wallet registered. Use PATCH /user/wallet to add one, then claim the reward.';
      } else {
        errorNote =
          'ARENA_COIN_TOKEN_ID not configured — reward logged off-chain only';
      }
      this.logger.warn(`[REWARD] ${errorNote}`);
    }

    // Update winner's off-chain balance only if successful
    if (txStatus === TransactionStatus.SUCCESS) {
      await this.prisma.user.update({
        where: { id: winnerUserId },
        data: {
          walletBalance: { increment: amount },
          totalWins: { increment: 1 },
        },
      });
    }

    await this.logTransaction({
      senderAccountId: 'TREASURY',
      receiverAccountId: winner.hederaAccountId ?? 'NOT_REGISTERED',
      amount,
      type: TransactionType.REWARD_RELEASE,
      status: txStatus,
      competitionId,
      hederaTransactionId: hederaTxId ?? undefined,
      errorNote: errorNote ?? undefined,
    });

    return {
      success: txStatus === TransactionStatus.SUCCESS,
      pending: txStatus === TransactionStatus.PENDING_ASSOCIATION,
      winnerUserId,
      recipientAccountId: winner.hederaAccountId ?? null,
      amount,
      hederaTransactionId: hederaTxId,
      ...(errorNote && { note: errorNote }),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  //  4. REFUND — Company cancelled hackathon
  // ─────────────────────────────────────────────────────────────────

  async refundEscrow(
    companyUserId: string,
    amount: number,
    competitionId: string,
  ) {
    if (amount <= 0) return;

    const company = await this.prisma.user.findUnique({
      where: { id: companyUserId },
      select: { id: true, hederaAccountId: true, walletBalance: true },
    });
    if (!company) throw new NotFoundException('Company user not found');

    const tokenIdStr =
      this.config.get<string>('ARENA_COIN_TOKEN_ID') ?? 'NOT_SET';

    // Return coins to company off-chain balance
    await this.prisma.user.update({
      where: { id: companyUserId },
      data: { walletBalance: { increment: amount } },
    });

    let hederaTxId: string | null = null;
    let txStatus: TransactionStatus = TransactionStatus.SUCCESS;
    let errorNote: string | null = null;

    if (company.hederaAccountId && tokenIdStr !== 'NOT_SET') {
      const { client, operatorId, operatorKey } = this.buildClient();
      const tokenId = this.arenaTokenId;
      const recipientId = AccountId.fromString(company.hederaAccountId);
      const atomicAmount = this.toAtomicUnits(amount);

      try {
        const transferTx = await new TransferTransaction()
          .addTokenTransfer(tokenId, operatorId, -atomicAmount)
          .addTokenTransfer(tokenId, recipientId, atomicAmount)
          .freezeWith(client)
          .sign(operatorKey);

        const submit = await transferTx.execute(client);
        await submit.getReceipt(client);
        hederaTxId = submit.transactionId.toString();
        this.logger.log(
          `Refund: ${amount} ARENA → ${company.hederaAccountId} for competition ${competitionId}`,
        );
      } catch (err: unknown) {
        const msg: string = err instanceof Error ? err.message : String(err);
        txStatus = TransactionStatus.FAILED;
        errorNote = `On-chain refund failed (off-chain balance already restored): ${msg}`;
        this.logger.warn(`[REFUND] ${errorNote}`);
      }
      client.close();
    } else {
      errorNote =
        'Refund is off-chain only (no Hedera wallet or token not configured)';
    }

    await this.logTransaction({
      senderAccountId: 'TREASURY',
      receiverAccountId: company.hederaAccountId ?? 'OFF_CHAIN',
      amount,
      type: TransactionType.REFUND,
      status: txStatus,
      competitionId,
      hederaTransactionId: hederaTxId ?? undefined,
      errorNote: errorNote ?? undefined,
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  5. QUERY — Get user wallet info + transaction history
  // ─────────────────────────────────────────────────────────────────

  async getWalletInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        walletBalance: true,
        hederaAccountId: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const tokenId = this.config.get<string>('ARENA_COIN_TOKEN_ID') ?? null;

    const transactions = await this.prisma.transactionLog.findMany({
      where: {
        OR: [
          { receiverAccountId: user.hederaAccountId ?? '__none__' },
          { senderAccountId: user.hederaAccountId ?? '__none__' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return {
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      walletBalance: user.walletBalance,
      hederaAccountId: user.hederaAccountId,
      tokenId,
      hashScanUrl: user.hederaAccountId
        ? `https://hashscan.io/testnet/account/${user.hederaAccountId}`
        : null,
      transactions,
    };
  }

  async getTransactionHistory(competitionId: string) {
    return this.prisma.transactionLog.findMany({
      where: { competitionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─────────────────────────────────────────────────────────────────
  //  PRIVATE — Internal log helper
  // ─────────────────────────────────────────────────────────────────

  private async logTransaction(data: {
    senderAccountId?: string;
    receiverAccountId: string;
    amount: number;
    type: TransactionType;
    status: TransactionStatus;
    competitionId?: string;
    hederaTransactionId?: string;
    errorNote?: string;
  }) {
    const tokenId = this.config.get<string>('ARENA_COIN_TOKEN_ID') ?? 'NOT_SET';
    return this.prisma.transactionLog.create({
      data: {
        senderAccountId: data.senderAccountId ?? 'TREASURY',
        receiverAccountId: data.receiverAccountId,
        amount: data.amount,
        tokenId,
        type: data.type,
        status: data.status,
        competitionId: data.competitionId,
        hederaTransactionId: data.hederaTransactionId,
        errorNote: data.errorNote,
      },
    });
  }
}
