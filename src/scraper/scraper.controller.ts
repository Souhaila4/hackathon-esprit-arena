import { Controller, Get, Query } from '@nestjs/common';
import { ScraperService } from './scraper.service';

@Controller('scraper')
export class ScraperController {
  constructor(private readonly scraperService: ScraperService) {}

  /**
   * Endpoint de test pour scraper GitHub
   * Usage: GET /scraper/test-github?url=https://github.com/username
   */
  @Get('test-github')
  async testGitHub(@Query('url') url: string) {
    if (!url) {
      return { error: 'Missing url parameter' };
    }

    try {
      const repos = await this.scraperService.getGitHubRepos(url);
      return {
        success: true,
        count: repos.length,
        repos,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: message,
      };
    }
  }
}
