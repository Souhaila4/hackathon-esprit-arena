import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ScoringPipelineService } from './scoring-pipeline.service';
import { SCORING_QUEUE } from './scoring.constants';

@Processor(SCORING_QUEUE, {
  concurrency: Number(process.env.SCORING_WORKER_CONCURRENCY ?? 2),
})
export class ScoringQueueProcessor extends WorkerHost {
  private readonly log = new Logger(ScoringQueueProcessor.name);

  constructor(private readonly pipeline: ScoringPipelineService) {
    super();
  }

  async process(
    job: Job<{ participantId: string; githubUrl: string }>,
  ): Promise<void> {
    const { participantId, githubUrl } = job.data;
    this.log.log(`Job ${String(job.id)} scoring participant=${participantId}`);
    await this.pipeline.run(participantId, githubUrl);
  }
}
