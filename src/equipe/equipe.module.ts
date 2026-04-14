import { Module } from '@nestjs/common';
import { EquipeController } from './equipe.controller';
import { EquipeService } from './equipe.service';
import { AuthModule } from '../auth/auth.module';
import { StreamModule } from '../stream/stream.module';

@Module({
  imports: [AuthModule, StreamModule],
  controllers: [EquipeController],
  providers: [EquipeService],
  exports: [EquipeService],
})
export class EquipeModule {}
