import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithTimeout } from '../common/http-resilience';

@Injectable()
export class GitHubApiService {
  private readonly baseUrl = 'https://api.github.com';

  constructor(private readonly configService: ConfigService) {}

  private get githubTimeoutMs(): number {
    return Number(this.configService.get('GITHUB_HTTP_TIMEOUT_MS', 15_000));
  }

  parseRepoUrl(repoUrl: string) {
    const normalized = repoUrl.trim().replace(/\/+$/, '');
    const match = normalized.match(
      /^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i,
    );
    if (!match) {
      throw new InternalServerErrorException('Invalid GitHub URL format');
    }
    return {
      owner: match[1],
      repo: match[2],
    };
  }

  async request<T>(path: string, accept?: string): Promise<T> {
    const response = await this.requestWithResponse(path, accept);
    return (await response.json()) as T;
  }

  async requestWithResponse(path: string, accept?: string): Promise<Response> {
    const token = this.configService.get<string>('GITHUB_TOKEN');
    const response = await fetchWithTimeout(
      `${this.baseUrl}${path}`,
      {
        method: 'GET',
        headers: {
          Accept: accept ?? 'application/vnd.github+json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      this.githubTimeoutMs,
    );
    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `GitHub API failed (${response.status}): ${body.slice(0, 500)}`,
      );
    }
    return response;
  }

  async requestText(path: string): Promise<string> {
    const token = this.configService.get<string>('GITHUB_TOKEN');
    const response = await fetchWithTimeout(
      `${this.baseUrl}${path}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github.raw',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      this.githubTimeoutMs,
    );
    if (!response.ok) {
      return '';
    }
    return response.text();
  }

  async requestRawFromGithub(
    owner: string,
    repo: string,
    branch: string,
    path: string,
  ): Promise<string> {
    const token = this.configService.get<string>('GITHUB_TOKEN');
    const encodedPath = path
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    const response = await fetchWithTimeout(
      `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(branch)}/${encodedPath}`,
      {
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      this.githubTimeoutMs,
    );

    if (!response.ok) {
      return '';
    }
    return response.text();
  }
}
