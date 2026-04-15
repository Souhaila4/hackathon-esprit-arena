import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { ScoringPipelineService } from './scoring-pipeline.service';
import { SCORING_QUEUE } from './scoring.constants';

/**
 * Enfile le scoring (BullMQ) ou l’exécute en arrière-plan sans Redis selon la config.
 */
@Injectable()
export class ScoringDispatcherService {
  private readonly logger = new Logger(ScoringDispatcherService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly pipeline: ScoringPipelineService,
    @Optional() @InjectQueue(SCORING_QUEUE) private readonly queue: Queue | null,
  ) {}

  /**
   * Après un submit HTTP réussi : ne bloque pas la réponse.
   */
  dispatchAfterSubmit(participantId: string, githubUrl: string): void {
    const useQueue =
      this.config.get<string>('QUEUE_SCORING_ENABLED') === 'true' &&
      this.queue != null;

    if (!useQueue) {
      void this.pipeline.run(participantId, githubUrl).catch((err) =>
        this.logger.error(
          `Inline scoring failed: ${err instanceof Error ? err.message : err}`,
        ),
      );
      return;
    }

    void this.enqueue(participantId, githubUrl);
  }

  private async enqueue(
    participantId: string,
    githubUrl: string,
  ): Promise<void> {
    const jobId = `scoring-${participantId}`;
    try {
      await this.queue!.add(
        'run',
        { participantId, githubUrl },
        {
          jobId,
          attempts: Number(this.config.get('SCORING_JOB_ATTEMPTS', 3)),
          backoff: {
            type: 'exponential',
            delay: Number(this.config.get('SCORING_JOB_BACKOFF_MS', 10_000)),
          },
          removeOnComplete: {
            count: Number(this.config.get('SCORING_JOB_KEEP_COMPLETED', 1000)),
          },
          removeOnFail: {
            count: Number(this.config.get('SCORING_JOB_KEEP_FAILED', 500)),
          },
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /job id already exists|duplicate job id|already exists/i.test(msg)
      ) {
        this.logger.debug(
          `Scoring job already queued for participant ${participantId}`,
        );
        return;
      }
      this.logger.warn(
        `Queue add failed (${msg}), falling back to inline scoring`,
      );
      void this.pipeline.run(participantId, githubUrl).catch((e) =>
        this.logger.error(e),
      );
    }
  }
}
