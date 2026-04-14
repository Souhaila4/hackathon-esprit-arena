import { Injectable } from '@nestjs/common';
import { Agent } from './base.agent';
import {
  CodeSamplingResult,
  Evidence,
  RepoActivity,
  RepoMetadata,
  StructureAnalysis,
} from './agents.types';

export interface EvidenceBuilderInput {
  repo: RepoMetadata;
  activity: RepoActivity;
  structure: StructureAnalysis;
  samples: CodeSamplingResult;
  competitionTopic?: string;
}

@Injectable()
export class EvidenceBuilderAgent implements Agent<
  EvidenceBuilderInput,
  Evidence
> {
  async execute(input: EvidenceBuilderInput): Promise<Evidence> {
    const stack = this.detectStack(input.repo.tree, input.repo.languages);
    const dependencies = this.detectDependencies(
      input.repo.readme,
      input.repo.tree,
    );

    return {
      repo: {
        owner: input.repo.owner,
        repo: input.repo.repo,
        defaultBranch: input.repo.defaultBranch,
        htmlUrl: input.repo.htmlUrl,
        languages: input.repo.languages,
        fileCount: input.repo.fileCount,
      },
      readmeSummary: this.summarizeReadme(input.repo.readme),
      activity: input.activity,
      structure: input.structure,
      stack,
      dependencies,
      verifiedFiles: input.samples.sampledFiles,
      codeSamples: input.samples.codeSamples,
      competitionTopic: input.competitionTopic,
    };
  }

  private summarizeReadme(readme: string): string {
    if (!readme.trim()) {
      return 'README not found';
    }
    return readme
      .split('\n')
      .slice(0, 30)
      .join(' ')
      .replace(/\s+/g, ' ')
      .slice(0, 1200);
  }

  private detectStack(files: string[], languages: string[]): string[] {
    const stack = new Set<string>(languages);
    if (files.some((file) => /nest-cli\.json/i.test(file))) stack.add('NestJS');
    if (files.some((file) => /next\.config/i.test(file))) stack.add('Next.js');
    if (files.some((file) => /vite\.config/i.test(file))) stack.add('Vite');
    if (files.some((file) => /dockerfile/i.test(file))) stack.add('Docker');
    if (files.some((file) => /prisma\/schema\.prisma/i.test(file)))
      stack.add('Prisma');
    return [...stack].slice(0, 20);
  }

  private detectDependencies(readme: string, files: string[]): string[] {
    const known = [
      'postgres',
      'mongodb',
      'redis',
      'docker',
      'kafka',
      'rabbitmq',
    ];
    const haystack = `${readme}\n${files.join('\n')}`.toLowerCase();
    return known.filter((item) => haystack.includes(item));
  }
}
