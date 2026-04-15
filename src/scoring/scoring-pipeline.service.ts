import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrchestratorAgent } from '../agents/orchestrator.agent';
/**
 * Évaluation complète du repo (agents) + persistance du score.
 * Appelée soit en inline après submit, soit par le worker BullMQ.
 */
@Injectable()
export class ScoringPipelineService {
  private readonly logger = new Logger(ScoringPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestratorAgent: OrchestratorAgent,
  ) {}

  async run(participantId: string, githubUrl: string): Promise<void> {
    try {
      const participant = await this.prisma.competitionParticipant.findUnique({
        where: { id: participantId },
        include: {
          user: { select: { firstName: true, lastName: true } },
          competition: { select: { description: true } },
        },
      });
      if (!participant?.user) {
        this.logger.warn(
          `Participant ${participantId} or user not found; skipping pipeline`,
        );
        return;
      }
      const teamName =
        [participant.user.firstName, participant.user.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() || 'Unknown';

      const result = await this.orchestratorAgent.evaluateRepo(githubUrl, {
        submissionId: participantId,
        teamName,
        competitionTopic: participant.competition?.description ?? undefined,
      });

      await this.prisma.competitionParticipant.update({
        where: { id: participantId },
        data: {
          score: result.finalScore,
          scoringReport: JSON.parse(
            JSON.stringify({
              finalScore: result.finalScore,
              codeJudge: {
                complexity: result.codeScore.complexity,
                codeQuality: result.codeScore.codeQuality,
                architecture: result.codeScore.architecture,
                reasoning: result.codeScore.reasoning,
              },
              productJudge: {
                innovation: result.productScore.innovation,
                impact: result.productScore.impact,
                usability: result.productScore.usability,
                reasoning: result.productScore.reasoning,
              },
              antiCheat: result.antiCheat,
              report: {
                title: result.report.title,
                summary: result.report.summary,
                highlights: result.report.highlights,
                warnings: result.report.warnings,
              },
              breakdown: result.scoring.breakdown,
            }),
          ),
        },
      });

      this.logger.log(
        `Pipeline score for participant ${participantId}: ${result.finalScore}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Scoring pipeline failed for participant ${participantId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }
}
