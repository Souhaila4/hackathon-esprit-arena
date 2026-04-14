import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';

@Module({
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService], // Exported so CompetitionModule can use it
})
export class WalletModule {}
