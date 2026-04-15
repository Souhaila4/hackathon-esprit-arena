import { Injectable } from '@nestjs/common';
import { Agent } from './base.agent';
import { Evidence, ReportResult } from './agents.types';

export interface ReportInput {
  teamName: string;
  finalScore: number;
  evidence: Evidence;
  antiCheatFlags: string[];
}

@Injectable()
export class ReportAgent implements Agent<ReportInput, ReportResult> {
  async execute(input: ReportInput): Promise<ReportResult> {
    const highlights: string[] = [];
    const warnings: string[] = [];

    if (input.evidence.structure.hasBackend)
      highlights.push('Backend layer detected');
    if (input.evidence.structure.hasFrontend)
      highlights.push('Frontend layer detected');
    if (input.evidence.activity.contributors > 1) {
      highlights.push('Multiple contributors detected');
    }
    if (input.evidence.structure.hasTests) {
      highlights.push('Automated tests detected');
    } else {
      warnings.push('No test coverage detected');
    }

    if (input.evidence.activity.commits < 3) {
      warnings.push('Limited commit history');
    }
    warnings.push(...input.antiCheatFlags);

    return {
      title: `${input.teamName} - Score ${input.finalScore.toFixed(2)}`,
      summary: `Repository ${input.evidence.repo.owner}/${input.evidence.repo.repo} evaluated with evidence-based scoring.`,
      highlights: [...new Set(highlights)],
      warnings: [...new Set(warnings)],
      score: input.finalScore,
    };
  }
}
