export interface RepoMetadata {
  owner: string;
  repo: string;
  defaultBranch: string;
  readme: string;
  tree: string[];
  treeWithSize: Array<{ path: string; size: number }>;
  fileCount: number;
  languages: string[];
  createdAt: string;
  lastPushedAt: string;
  htmlUrl: string;
}

export interface RepoActivity {
  commits: number;
  contributors: number;
  lastCommit: string | null;
  createdAt: string;
}

export interface StructureAnalysis {
  hasBackend: boolean;
  hasFrontend: boolean;
  hasTests: boolean;
  hasCi: boolean;
  languages: string[];
  configFiles: string[];
  architectureQuality: number;
  fileCount: number;
}

export interface CodeSample {
  path: string;
  reason: 'entry' | 'api' | 'component' | 'largest';
  snippet: string;
}

export interface CodeSamplingResult {
  codeSamples: CodeSample[];
  sampledFiles: string[];
}

export interface Evidence {
  repo: Pick<
    RepoMetadata,
    'owner' | 'repo' | 'defaultBranch' | 'htmlUrl' | 'languages' | 'fileCount'
  >;
  readmeSummary: string;
  activity: RepoActivity;
  structure: StructureAnalysis;
  stack: string[];
  dependencies: string[];
  verifiedFiles: string[];
  codeSamples: CodeSample[];
  competitionTopic?: string;
}

export interface AntiCheatResult {
  suspicious: boolean;
  penalty: number;
  flags: string[];
}

export interface CodeJudgeScore {
  complexity: number;
  codeQuality: number;
  architecture: number;
  reasoning: string;
}

export interface ProductJudgeScore {
  innovation: number;
  impact: number;
  usability: number;
  reasoning: string;
}

export interface ScoringBreakdown {
  complexityWeighted: number;
  innovationWeighted: number;
  impactWeighted: number;
  qualityWeighted: number;
  rawBeforePenalty: number;
  penalty: number;
  final: number;
}

export interface ScoringResult {
  finalScore: number;
  breakdown: ScoringBreakdown;
}

export interface ReportResult {
  title: string;
  summary: string;
  highlights: string[];
  warnings: string[];
  score: number;
}

export interface OrchestratorInput {
  submissionId: string;
  teamName: string;
  githubUrl: string;
  competitionTopic?: string;
  /** Optional hook for Bull / progress reporting (10–100 after each pipeline step). */
  onProgress?: (progress: number) => void | Promise<void>;
}

export interface OrchestratorResult {
  finalScore: number;
  evidence: Evidence;
  antiCheat: AntiCheatResult;
  codeScore: CodeJudgeScore;
  productScore: ProductJudgeScore;
  scoring: ScoringResult;
  report: ReportResult;
}
