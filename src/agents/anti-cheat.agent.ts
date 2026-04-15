import { Injectable } from '@nestjs/common';
import { Agent } from './base.agent';
import { AntiCheatResult, Evidence } from './agents.types';

@Injectable()
export class AntiCheatAgent implements Agent<Evidence, AntiCheatResult> {
  async execute(evidence: Evidence): Promise<AntiCheatResult> {
    let penalty = 0;
    const flags: string[] = [];

    if (evidence.activity.commits < 3) {
      penalty += 40;
      flags.push('Very low commit history');
    }
    if (evidence.structure.fileCount < 5) {
      penalty += 60;
      flags.push('Repository has too few files');
    }
    if (evidence.activity.contributors <= 1) {
      penalty += 10;
      flags.push('Single contributor only');
    }
    if (!evidence.structure.hasTests) {
      penalty += 10;
      flags.push('No tests detected');
    }
    if (evidence.codeSamples.length < 2) {
      penalty += 20;
      flags.push('Insufficient source code samples');
    }

    return {
      suspicious: penalty >= 40,
      penalty,
      flags,
    };
  }
}
