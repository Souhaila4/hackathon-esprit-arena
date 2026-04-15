import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Specialty } from '@prisma/client';
import type {
  PredictCvResponse,
  CvExtractionResult,
} from './cv-extraction.types';

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const RESUME_FILENAME = 'resume.docx';

const GRADIO_SPACE = 'kaaboura/cv-extraction-prediction';
const PREDICT_ENDPOINT = '/predict_cv';
const MAX_SKILL_TAGS = 30;
const MAX_SKILL_LENGTH = 50;

/** Map API prediction string to our Prisma Specialty enum */
const PREDICTION_TO_SPECIALTY: Record<string, Specialty | null> = {
  backend: 'BACKEND',
  frontend: 'FRONTEND',
  full_stack: 'FULLSTACK',
  qa: null,
  cybersecurity: 'CYBERSECURITY',
  bi: 'BI',
  data_engineer: 'DATA',
  business_analyst: 'BI',
  project_manager: null,
  mobile: 'MOBILE',
};

@Injectable()
export class CvExtractionService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Call Hugging Face Gradio API to predict specialty and extract skills from a resume file.
   * Set HUGGINGFACE_TOKEN in .env for private spaces; set CV_EXTRACTION_API_KEY to the key
   * required by the space's "API Key" input. Expects .docx buffer (e.g. from multer).
   */
  async extractFromBuffer(buffer: Buffer): Promise<CvExtractionResult> {
    if (!buffer?.length) {
      throw new BadRequestException('Resume file is empty');
    }

    // Dynamic import to avoid ERR_REQUIRE_ESM at startup (@gradio/client is ESM-only)
    const { Client, FileData } = await import('@gradio/client');

    const hfToken = this.config.get<string>('HUGGINGFACE_TOKEN');
    const connectOptions = hfToken?.trim()
      ? { token: hfToken.trim() as `hf_${string}` }
      : undefined;
    const apiKey =
      this.config.get<string>('CV_EXTRACTION_API_KEY')?.trim() ?? 'null';

    const file = new File([new Uint8Array(buffer)], RESUME_FILENAME, {
      type: DOCX_MIME,
    });

    let result: unknown;
    try {
      const client = await Client.connect(GRADIO_SPACE, connectOptions);
      const root = client.config?.root ?? client.config?.root_url;
      if (!root) throw new Error('Missing Gradio root URL');
      const uploadRes = await client.upload_files(root, [file]);
      if (!uploadRes.files?.length) {
        throw new Error(uploadRes.error ?? 'Upload failed');
      }
      const fileData = new FileData({
        path: uploadRes.files[0],
        orig_name: RESUME_FILENAME,
      });
      result = await client.predict(PREDICT_ENDPOINT, {
        resume_file: fileData,
        api_key: apiKey,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (
        message.includes('Space metadata could not be loaded') ||
        message.includes('could not be loaded')
      ) {
        throw new BadRequestException(
          'CV extraction service is temporarily unavailable (Hugging Face space may be sleeping). Please try again in a minute.',
        );
      }
      throw new BadRequestException(`CV extraction failed: ${message}`);
    }

    const data = this.normalizeResult(result);
    if (data?.error) {
      throw new BadRequestException(`CV extraction failed: ${data.error}`);
    }

    const mainSpecialty = this.mapPredictionToSpecialty(data?.prediction);
    const skillTags = this.normalizeSkills(data?.skills ?? []);

    return {
      mainSpecialty,
      skillTags,
      rawPrediction: data?.prediction,
      confidenceScores: data?.confidence_scores,
    };
  }

  private normalizeResult(result: unknown): PredictCvResponse | null {
    if (result == null) return null;
    const raw = (result as { data?: unknown })?.data ?? result;
    if (Array.isArray(raw) && raw.length > 0)
      return raw[0] as PredictCvResponse;
    if (typeof raw === 'object' && raw !== null)
      return raw as PredictCvResponse;
    return null;
  }

  private mapPredictionToSpecialty(
    prediction: string | undefined,
  ): Specialty | null {
    if (!prediction || typeof prediction !== 'string') return null;
    const key = prediction.toLowerCase().replace(/-/g, '_');
    return PREDICTION_TO_SPECIALTY[key] ?? null;
  }

  private normalizeSkills(skills: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];

    for (const s of skills) {
      const t = typeof s === 'string' ? s.trim() : '';
      if (!t || t.length > MAX_SKILL_LENGTH) continue;
      if (seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      out.push(t);
      if (out.length >= MAX_SKILL_TAGS) break;
    }

    return out;
  }
}
