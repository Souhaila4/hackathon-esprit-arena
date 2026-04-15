/**
 * Response shape from kaaboura/cv-extraction-prediction /predict_cv endpoint.
 */
export interface PredictCvResponse {
  prediction?: string;
  confidence_scores?: Record<string, number>;
  skills?: string[];
  skills_by_category?: Record<string, string[]>;
  skill_mentions?: Record<string, number>;
  total_skills_count?: number;
  contact_info?: { email?: string; phone?: string | null };
  resume_filename?: string;
  error?: string | null;
}

export interface CvExtractionResult {
  mainSpecialty: string | null;
  skillTags: string[];
  rawPrediction?: string;
  confidenceScores?: Record<string, number>;
}
