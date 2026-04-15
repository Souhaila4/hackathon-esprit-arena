import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface LinkedInPost {
  text: string;
  publishedAt: string;
  url?: string;
  likes?: number;
  comments?: number;
  author?: string;
}

export interface GitHubRepo {
  name: string;
  description?: string;
  url: string;
  stars: number;
  forks: number;
  watchers: number;
  openIssues: number;
  size: number; // Size in KB
  language?: string;
  languages?: { [key: string]: number }; // Language breakdown by percentage
  topics?: string[]; // Repository topics/tags
  license?: string;
  defaultBranch?: string;
  createdAt: string;
  updatedAt: string;
  lastCommit?: {
    date: string;
    message: string;
    author: string;
  };
  readme?: string;
}

/**
 * Service de scraping gratuit pour LinkedIn et GitHub
 * - GitHub: utilise l'API REST publique (gratuite)
 * - LinkedIn: méthode limitée sans authentification
 *
 * Configuration (optionnelle):
 * - GITHUB_TOKEN: Token personnel GitHub pour augmenter la limite de requêtes
 *   Sans token: 60 req/h | Avec token: 5000 req/h
 */
@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private readonly GITHUB_API = 'https://api.github.com';
  private readonly GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Optional
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // ms

  /**
   * Récupère les 3 derniers repos publics GitHub d'un utilisateur
   * Utilise l'API REST GitHub (gratuite, 60 req/h sans auth, 5000 req/h avec token)
   */
  async getGitHubRepos(githubUrl: string): Promise<GitHubRepo[]> {
    try {
      const username = this.extractGitHubUsername(githubUrl);
      if (!username) {
        this.logger.warn(`Could not extract username from: ${githubUrl}`);
        return [];
      }

      this.logger.log(`Fetching GitHub repos for user: ${username}`);

      // 1. Récupérer les repos de l'utilisateur (triés par date de mise à jour)
      const reposResponse = await this.githubApiCall(
        `${this.GITHUB_API}/users/${username}/repos`,
        {
          params: {
            sort: 'updated',
            direction: 'desc',
            per_page: 3,
            type: 'owner', // Seulement les repos dont l'user est le propriétaire
          },
          timeout: 10000,
        },
      );

      const repos = reposResponse.data;

      if (!Array.isArray(repos)) {
        this.logger.error('GitHub API returned non-array response');
        return [];
      }

      this.logger.log(`Found ${repos.length} repos for ${username}`);

      if (repos.length === 0) {
        return [];
      }

      // 2. Pour chaque repo, récupérer les données enrichies (README, langages, derniers commits)
      const enrichedRepos: GitHubRepo[] = await Promise.all(
        repos.map(async (repo: any) => {
          let readme: string | undefined;
          let languages: { [key: string]: number } | undefined;
          let lastCommit:
            | { date: string; message: string; author: string }
            | undefined;

          try {
            // Récupérer le README
            const readmeResponse = await this.githubApiCall(
              `${this.GITHUB_API}/repos/${username}/${repo.name}/readme`,
              {
                headers: {
                  Accept: 'application/vnd.github.v3.raw', // Format texte brut
                },
                timeout: 5000,
              },
            );

            // Limiter le README à 2000 caractères
            if (typeof readmeResponse.data === 'string') {
              readme = readmeResponse.data.substring(0, 2000);
            }
          } catch (readmeError) {
            this.logger.debug(`No README found for ${repo.name}`);
          }

          try {
            // Récupérer les statistiques des langages
            const languagesResponse = await this.githubApiCall(
              `${this.GITHUB_API}/repos/${username}/${repo.name}/languages`,
              { timeout: 5000 },
            );

            if (
              languagesResponse.data &&
              typeof languagesResponse.data === 'object'
            ) {
              const langMap = languagesResponse.data as Record<string, number>;
              const total = Object.values(langMap).reduce(
                (sum, bytes) => sum + bytes,
                0,
              );

              // Convertir en pourcentages
              languages = Object.entries(langMap).reduce(
                (acc, [lang, bytes]) => {
                  acc[lang] = Math.round((bytes / total) * 100);
                  return acc;
                },
                {} as { [key: string]: number },
              );
            }
          } catch (langError) {
            this.logger.debug(`Could not fetch languages for ${repo.name}`);
          }

          try {
            // Récupérer le dernier commit
            const commitsResponse = await this.githubApiCall(
              `${this.GITHUB_API}/repos/${username}/${repo.name}/commits`,
              {
                params: { per_page: 1 },
                timeout: 5000,
              },
            );

            if (
              Array.isArray(commitsResponse.data) &&
              commitsResponse.data.length > 0
            ) {
              const commit = commitsResponse.data[0];
              lastCommit = {
                date: commit.commit?.author?.date || new Date().toISOString(),
                message:
                  commit.commit?.message?.split('\n')[0]?.substring(0, 100) ||
                  'No message',
                author: commit.commit?.author?.name || 'Unknown',
              };
            }
          } catch (commitError) {
            this.logger.debug(`Could not fetch commits for ${repo.name}`);
          }

          return {
            name: repo.name || 'Unknown',
            description: repo.description || undefined,
            url: repo.html_url || `https://github.com/${username}/${repo.name}`,
            stars:
              typeof repo.stargazers_count === 'number'
                ? repo.stargazers_count
                : 0,
            forks: typeof repo.forks_count === 'number' ? repo.forks_count : 0,
            watchers:
              typeof repo.watchers_count === 'number' ? repo.watchers_count : 0,
            openIssues:
              typeof repo.open_issues_count === 'number'
                ? repo.open_issues_count
                : 0,
            size: typeof repo.size === 'number' ? repo.size : 0,
            language: repo.language || undefined,
            languages,
            topics: Array.isArray(repo.topics) ? repo.topics : undefined,
            license: repo.license?.name || undefined,
            defaultBranch: repo.default_branch || undefined,
            createdAt: repo.created_at || new Date().toISOString(),
            updatedAt: repo.updated_at || new Date().toISOString(),
            lastCommit,
            readme,
          };
        }),
      );

      this.logger.log(
        `Successfully scraped ${enrichedRepos.length} GitHub repos`,
      );
      return enrichedRepos;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          this.logger.warn(`GitHub user not found: ${githubUrl}`);
        } else if (error.response?.status === 403) {
          this.logger.error('GitHub API rate limit exceeded');
        } else {
          this.logger.error(`GitHub API error: ${error.message}`);
        }
      } else {
        this.logger.error(`GitHub scraping error: ${error}`);
      }
      return [];
    }
  }

  /**
   * Récupère les posts LinkedIn (méthode limitée)
   * ATTENTION: LinkedIn n'a pas d'API publique gratuite.
   * Cette méthode retourne un tableau vide par défaut.
   *
   * Pour scraper LinkedIn, il faudrait:
   * 1. Utiliser Puppeteer avec des cookies de session (nécessite connexion)
   * 2. Utiliser un service tiers payant
   * 3. Demander à l'utilisateur de fournir ses cookies LinkedIn
   */
  async getLinkedInPosts(linkedinUrl: string): Promise<LinkedInPost[]> {
    this.logger.warn(
      'LinkedIn posts scraping is not available without authentication. ' +
        'LinkedIn requires login to view posts. Consider using Apify or asking users ' +
        'to provide their LinkedIn session cookies.',
    );

    // Retourner un tableau vide car le scraping LinkedIn gratuit
    // sans authentification n'est pas possible de manière fiable
    return [];
  }

  /**
   * Extrait le nom d'utilisateur d'une URL GitHub
   */
  private extractGitHubUsername(url: string): string | null {
    try {
      // Formats supportés:
      // - https://github.com/username
      // - https://github.com/username/
      const match = url.match(/github\.com\/([^\/\?#]+)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Effectue un appel à l'API GitHub avec retry et authentification
   */
  private async githubApiCall(url: string, config: any = {}): Promise<any> {
    const headers = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'ArenaOfCoders-Backend',
      ...config.headers,
    };

    // Ajouter le token si disponible
    if (this.GITHUB_TOKEN) {
      headers['Authorization'] = `Bearer ${this.GITHUB_TOKEN}`;
    }

    const requestConfig = {
      ...config,
      headers,
    };

    // Retry avec exponential backoff
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await axios.get(url, requestConfig);
        return response;
      } catch (error) {
        if (axios.isAxiosError(error)) {
          // Ne pas retry sur 404 ou 403
          if (
            error.response?.status === 404 ||
            error.response?.status === 403
          ) {
            throw error;
          }

          // Dernier essai, throw l'erreur
          if (attempt === this.MAX_RETRIES) {
            throw error;
          }

          // Wait avant de réessayer (exponential backoff)
          const delay = this.RETRY_DELAY * Math.pow(2, attempt - 1);
          this.logger.debug(
            `Retry ${attempt}/${this.MAX_RETRIES} after ${delay}ms for ${url}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }

    throw new Error('Max retries exceeded');
  }
}
