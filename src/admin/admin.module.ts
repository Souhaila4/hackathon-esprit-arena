import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CompetitionModule } from '../competition/competition.module';

@Module({
  imports: [PrismaModule, CompetitionModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
