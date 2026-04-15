import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetchWithTimeout } from '../common/http-resilience';

@Injectable()
export class GroqAiService {
  private readonly endpoint = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(private readonly configService: ConfigService) {}

  hasApiKey(): boolean {
    return Boolean(this.configService.get<string>('GROQ_API_KEY'));
  }

  async askForJson<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    const apiKey = this.configService.get<string>('GROQ_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('GROQ_API_KEY is not configured');
    }

    const model =
      this.configService.get<string>('GROQ_MODEL') ?? 'llama-3.3-70b-versatile';

    const timeoutMs = Number(
      this.configService.get('GROQ_HTTP_TIMEOUT_MS', 90_000),
    );
    const response = await fetchWithTimeout(
      this.endpoint,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      },
      timeoutMs,
    );

    if (!response.ok) {
      const body = await response.text();
      throw new InternalServerErrorException(
        `Groq API failed (${response.status}): ${body.slice(0, 500)}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new InternalServerErrorException('Groq returned empty content');
    }

    try {
      return JSON.parse(content) as T;
    } catch {
      throw new InternalServerErrorException(
        `Groq did not return valid JSON: ${content.slice(0, 500)}`,
      );
    }
  }
}
