import { Injectable } from '@nestjs/common';
import { Agent } from './base.agent';
import { CodeSample, CodeSamplingResult, RepoMetadata } from './agents.types';
import { GitHubApiService } from './github-api.service';

@Injectable()
export class CodeSamplerAgent implements Agent<
  RepoMetadata,
  CodeSamplingResult
> {
  constructor(private readonly githubApi: GitHubApiService) {}

  async execute(repo: RepoMetadata): Promise<CodeSamplingResult> {
    const selected = this.selectRepresentativeFiles(repo.treeWithSize).slice(
      0,
      8,
    );
    const codeSamples: CodeSample[] = [];

    for (const selectedFile of selected) {
      const raw = await this.githubApi.requestRawFromGithub(
        repo.owner,
        repo.repo,
        repo.defaultBranch,
        selectedFile.path,
      );
      if (!raw) {
        continue;
      }
      codeSamples.push({
        path: selectedFile.path,
        reason: selectedFile.reason,
        snippet: this.toSnippet(raw),
      });
    }

    return {
      codeSamples,
      sampledFiles: selected.map((item) => item.path),
    };
  }

  private selectRepresentativeFiles(
    files: Array<{ path: string; size: number }>,
  ): Array<{ path: string; reason: CodeSample['reason'] }> {
    const source = files.filter((item) =>
      /\.(ts|tsx|js|jsx|py|go|java|cs|rb|php)$/i.test(item.path),
    );

    const entry = source.find((item) =>
      /(main|index|app|server)\.(ts|tsx|js|jsx|py|go|java|cs|rb|php)$/i.test(
        item.path.split('/').pop() ?? '',
      ),
    );
    const api = source.find((item) =>
      /(controller|route|router|endpoint|api)/i.test(item.path),
    );
    const component = source.find((item) =>
      /(component|screen|page|view)/i.test(item.path),
    );
    const largest = [...source]
      .sort((a, b) => b.size - a.size)
      .slice(0, 5)
      .map((item) => ({ path: item.path, reason: 'largest' as const }));

    const candidates: Array<{ path: string; reason: CodeSample['reason'] }> =
      [];
    if (entry) candidates.push({ path: entry.path, reason: 'entry' });
    if (api) candidates.push({ path: api.path, reason: 'api' });
    if (component)
      candidates.push({ path: component.path, reason: 'component' });
    candidates.push(...largest);

    const unique = new Map<
      string,
      { path: string; reason: CodeSample['reason'] }
    >();
    for (const item of candidates) {
      if (!unique.has(item.path)) {
        unique.set(item.path, item);
      }
    }
    return [...unique.values()];
  }

  private toSnippet(content: string): string {
    const maxChars = 4000;
    const lines = content.split('\n').slice(0, 120).join('\n');
    if (lines.length <= maxChars) {
      return lines;
    }
    return `${lines.slice(0, maxChars)}\n// ... truncated ...`;
  }
}
