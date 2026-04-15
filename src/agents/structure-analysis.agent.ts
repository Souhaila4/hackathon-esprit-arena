import { Injectable } from '@nestjs/common';
import { Agent } from './base.agent';
import { RepoMetadata, StructureAnalysis } from './agents.types';

@Injectable()
export class StructureAnalysisAgent implements Agent<
  RepoMetadata,
  StructureAnalysis
> {
  async execute(repo: RepoMetadata): Promise<StructureAnalysis> {
    const files = repo.tree;
    const hasBackend = files.some((path) =>
      /(backend|server|api|src\/main\.(ts|js)|nest-cli\.json|pom\.xml)$/i.test(
        path,
      ),
    );
    const hasFrontend = files.some((path) =>
      /(frontend|client|src\/app|src\/pages|vite\.config|next\.config)/i.test(
        path,
      ),
    );
    const hasTests = files.some((path) =>
      /(test|tests|spec|__tests__|\.spec\.|\.test\.)/i.test(path),
    );
    const hasCi = files.some((path) =>
      /^\.github\/workflows\/.+\.(yml|yaml)$/i.test(path),
    );

    const configFiles = files.filter((path) =>
      /(^|\/)(dockerfile|docker-compose\.ya?ml|package\.json|tsconfig\.json|requirements\.txt|pyproject\.toml|go\.mod|pom\.xml|build\.gradle)$/i.test(
        path,
      ),
    );

    const architectureQuality = this.computeArchitectureQuality({
      hasBackend,
      hasFrontend,
      hasTests,
      hasCi,
      configCount: configFiles.length,
    });

    return {
      hasBackend,
      hasFrontend,
      hasTests,
      hasCi,
      languages: repo.languages,
      configFiles: configFiles.slice(0, 20),
      architectureQuality,
      fileCount: repo.fileCount,
    };
  }

  private computeArchitectureQuality(input: {
    hasBackend: boolean;
    hasFrontend: boolean;
    hasTests: boolean;
    hasCi: boolean;
    configCount: number;
  }): number {
    let score = 1;
    if (input.hasBackend) score += 1;
    if (input.hasFrontend) score += 1;
    if (input.hasTests) score += 1;
    if (input.hasCi || input.configCount > 3) score += 1;
    return Math.min(score, 5);
  }
}
