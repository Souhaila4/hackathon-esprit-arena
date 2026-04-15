import { BadRequestException, Injectable } from '@nestjs/common';
import { Agent } from './base.agent';
import { RepoMetadata } from './agents.types';
import { GitHubApiService } from './github-api.service';

@Injectable()
export class RepoExtractorAgent implements Agent<string, RepoMetadata> {
  constructor(private readonly githubApi: GitHubApiService) {}

  async execute(repoUrl: string): Promise<RepoMetadata> {
    const normalizedUrl = repoUrl.trim();
    const parsed = this.safeParse(normalizedUrl);

    const repo = await this.githubApi.request<{
      owner: { login: string };
      name: string;
      default_branch: string;
      created_at: string;
      pushed_at: string;
      html_url: string;
      languages_url: string;
    }>(`/repos/${parsed.owner}/${parsed.repo}`);

    const readme = await this.githubApi.requestText(
      `/repos/${parsed.owner}/${parsed.repo}/readme`,
    );

    const treeResponse = await this.githubApi.request<{
      tree: Array<{ path: string; type: string; size?: number }>;
    }>(
      `/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`,
    );

    const languagesResponse = await this.githubApi.request<
      Record<string, number>
    >(`/repos/${parsed.owner}/${parsed.repo}/languages`);

    const files = treeResponse.tree.filter((item) => item.type === 'blob');
    const paths = files.map((item) => item.path);
    const treeWithSize = files.map((item) => ({
      path: item.path,
      size: item.size ?? 0,
    }));

    return {
      owner: repo.owner.login,
      repo: repo.name,
      defaultBranch: repo.default_branch,
      readme,
      tree: paths,
      treeWithSize,
      fileCount: paths.length,
      languages: Object.keys(languagesResponse),
      createdAt: repo.created_at,
      lastPushedAt: repo.pushed_at,
      htmlUrl: repo.html_url,
    };
  }

  private safeParse(url: string): { owner: string; repo: string } {
    try {
      return this.githubApi.parseRepoUrl(url);
    } catch {
      throw new BadRequestException(
        'githubUrl must be a valid GitHub repo URL',
      );
    }
  }
}
