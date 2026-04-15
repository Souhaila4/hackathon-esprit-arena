import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AntiCheatService } from './anti-cheat.service';
import { AntiCheatController } from './anti-cheat.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [AntiCheatController],
  providers: [AntiCheatService],
  exports: [AntiCheatService],
})
export class AntiCheatModule {}
