import { Injectable } from '@nestjs/common';
import { Agent } from './base.agent';
import { Evidence, ProductJudgeScore } from './agents.types';
import { GroqAiService } from './groq-ai.service';

@Injectable()
export class ProductJudgeAgent implements Agent<Evidence, ProductJudgeScore> {
  constructor(private readonly groq: GroqAiService) {}

  async execute(evidence: Evidence): Promise<ProductJudgeScore> {
    if (!this.groq.hasApiKey()) {
      return this.fallbackScore(evidence);
    }

    try {
      const result = await this.groq.askForJson<Partial<ProductJudgeScore>>(
        'You are a strict product judge. Evaluate only factual evidence. Return JSON only.',
        `Evaluate the product quality from this evidence:\n${JSON.stringify(evidence)}\n\n` +
          (evidence.competitionTopic
            ? `IMPORTANT HACKATHON TOPIC: "${evidence.competitionTopic}".\nYou MUST severely penalize the innovation and impact scores (give 0 or 1) if the product is off-topic or does not solve the hackathon's subject. Mention this in your reasoning.\n\n`
            : '') +
          `Return JSON with: innovation (0-10), impact (0-10), usability (0-10), reasoning (string).`,
      );
      return {
        innovation: this.clamp(result.innovation),
        impact: this.clamp(result.impact),
        usability: this.clamp(result.usability),
        reasoning: (result.reasoning ?? 'No reasoning provided').slice(0, 1200),
      };
    } catch {
      return this.fallbackScore(evidence);
    }
  }

  private fallbackScore(evidence: Evidence): ProductJudgeScore {
    const innovation = evidence.readmeSummary === 'README not found' ? 3 : 6;
    const impact =
      evidence.structure.hasFrontend || evidence.structure.hasBackend ? 6 : 4;
    const usability = evidence.structure.hasFrontend ? 6 : 4;
    return {
      innovation,
      impact,
      usability,
      reasoning:
        'Fallback heuristic scoring used because AI provider is unavailable.',
    };
  }

  private clamp(value: number | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return 0;
    }
    return Math.max(0, Math.min(10, Math.round(value)));
  }
}
