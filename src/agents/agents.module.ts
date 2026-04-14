import { Module } from '@nestjs/common';
import { AntiCheatAgent } from './anti-cheat.agent';
import { CodeJudgeAgent } from './code-judge.agent';
import { CodeSamplerAgent } from './code-sampler.agent';
import { EvidenceBuilderAgent } from './evidence-builder.agent';
import { GitHubApiService } from './github-api.service';
import { GroqAiService } from './groq-ai.service';
import { OrchestratorAgent } from './orchestrator.agent';
import { ProductJudgeAgent } from './product-judge.agent';
import { RepoActivityAgent } from './repo-activity.agent';
import { RepoExtractorAgent } from './repo-extractor.agent';
import { ReportAgent } from './report.agent';
import { ScoringAgent } from './scoring.agent';
import { StructureAnalysisAgent } from './structure-analysis.agent';

@Module({
  providers: [
    OrchestratorAgent,
    RepoExtractorAgent,
    RepoActivityAgent,
    StructureAnalysisAgent,
    CodeSamplerAgent,
    EvidenceBuilderAgent,
    GitHubApiService,
    GroqAiService,
    CodeJudgeAgent,
    ProductJudgeAgent,
    AntiCheatAgent,
    ScoringAgent,
    ReportAgent,
  ],
  exports: [OrchestratorAgent],
})
export class AgentsModule {}
