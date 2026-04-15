import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { PrismaModule } from '../prisma/prisma.module';
import { AgentsModule } from '../agents/agents.module';
import { ScoringPipelineService } from './scoring-pipeline.service';
import { ScoringDispatcherService } from './scoring-dispatcher.service';
import { ScoringQueueProcessor } from './scoring-queue.processor';
import { SCORING_QUEUE } from './scoring.constants';

function useQueue(): boolean {
  return process.env.QUEUE_SCORING_ENABLED === 'true';
}

@Module({})
export class ScoringModule {
  static register(): DynamicModule {
    const queueEnabled = useQueue();

    const imports: DynamicModule['imports'] = [
      PrismaModule,
      AgentsModule,
      ...(queueEnabled
        ? [
            BullModule.forRootAsync({
              imports: [ConfigModule],
              useFactory: (cfg: ConfigService) => ({
                connection: {
                  host: cfg.get<string>('REDIS_HOST', '127.0.0.1'),
                  port: Number(cfg.get<string>('REDIS_PORT', '6379')),
                  password: cfg.get<string>('REDIS_PASSWORD') || undefined,
                  maxRetriesPerRequest: null,
                },
              }),
              inject: [ConfigService],
            }),
            BullModule.registerQueue({
              name: SCORING_QUEUE,
            }),
            BullBoardModule.forRoot({
              route: '/queues',
              adapter: ExpressAdapter,
            }),
            BullBoardModule.forFeature({
              name: SCORING_QUEUE,
              adapter: BullMQAdapter,
            }),
          ]
        : []),
    ];

    return {
      module: ScoringModule,
      imports,
      providers: [
        ScoringPipelineService,
        ScoringDispatcherService,
        ...(queueEnabled ? [ScoringQueueProcessor] : []),
      ],
      exports: [ScoringDispatcherService],
    };
  }
}
