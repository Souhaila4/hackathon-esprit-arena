import { Injectable } from '@nestjs/common';
import { Agent } from './base.agent';
import { RepoActivity, RepoMetadata } from './agents.types';
import { GitHubApiService } from './github-api.service';

@Injectable()
export class RepoActivityAgent implements Agent<RepoMetadata, RepoActivity> {
  constructor(private readonly githubApi: GitHubApiService) {}

  async execute(repo: RepoMetadata): Promise<RepoActivity> {
    const commitsResponse = await this.githubApi.requestWithResponse(
      `/repos/${repo.owner}/${repo.repo}/commits?per_page=1`,
    );
    const linkHeader = commitsResponse.headers.get('link');
    const firstPageCommits = (await commitsResponse.json()) as Array<{
      commit?: { committer?: { date?: string } };
    }>;
    const commits =
      this.extractTotalFromLinkHeader(linkHeader) ?? firstPageCommits.length;

    const contributors = await this.githubApi.request<
      Array<{ login: string; contributions: number }>
    >(`/repos/${repo.owner}/${repo.repo}/contributors?per_page=100`);

    return {
      commits,
      contributors: contributors.length,
      lastCommit: firstPageCommits[0]?.commit?.committer?.date ?? null,
      createdAt: repo.createdAt,
    };
  }

  private extractTotalFromLinkHeader(link: string | null): number | null {
    if (!link) {
      return null;
    }
    const match = link.match(/<[^>]*[?&]page=(\d+)[^>]*>; rel="last"/);
    if (!match) {
      return null;
    }
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
