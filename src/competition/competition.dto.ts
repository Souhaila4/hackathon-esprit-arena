import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsDateString,
  IsOptional,
  IsNumber,
  IsPositive,
  IsInt,
  Min,
  IsBoolean,
  MaxLength,
  MinLength,
  IsIn,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CompetitionStatus,
  CompetitionDifficulty,
  Specialty,
} from '@prisma/client';

// ─────────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────────

export class CreateCompetitionDto {
  @ApiProperty({
    description: 'Title of the hackathon',
    example: 'AI Challenge 2026',
    minLength: 3,
    maxLength: 120,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  title: string;

  @ApiProperty({
    description: 'Full description / challenge brief for participants',
    example:
      'Build an AI-powered application that solves a real-world problem. Your solution will be judged on creativity, technical execution, and impact.',
    minLength: 10,
    maxLength: 5000,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(5000)
  description: string;

  @ApiProperty({
    description: 'Difficulty level of the competition',
    enum: CompetitionDifficulty,
    example: CompetitionDifficulty.MEDIUM,
  })
  @IsEnum(CompetitionDifficulty, {
    message: 'difficulty must be one of: EASY, MEDIUM, HARD',
  })
  difficulty: CompetitionDifficulty;

  @ApiPropertyOptional({
    description:
      'Specialty targeted by this hackathon (users with matching mainSpecialty get notified)',
    enum: Specialty,
    example: Specialty.FRONTEND,
  })
  @IsOptional()
  @IsEnum(Specialty, {
    message:
      'specialty must be one of: FRONTEND, BACKEND, FULLSTACK, MOBILE, DATA, BI, CYBERSECURITY, DESIGN, DEVOPS',
  })
  specialty?: Specialty;

  @ApiProperty({
    description:
      'ISO 8601 date-time when registration opens / competition starts (must be in future)',
    example: '2026-03-01T09:00:00.000Z',
  })
  @IsDateString({}, { message: 'startDate must be a valid ISO date string' })
  startDate: string;

  @ApiProperty({
    description:
      'ISO 8601 date-time when submissions close (must be after startDate)',
    example: '2026-03-03T18:00:00.000Z',
  })
  @IsDateString({}, { message: 'endDate must be a valid ISO date string' })
  endDate: string;

  @ApiPropertyOptional({
    description: 'Total prize pool (in your platform currency)',
    example: 5000,
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rewardPool?: number;

  @ApiPropertyOptional({
    description:
      'Maximum number of participants allowed (leave empty for unlimited)',
    example: 100,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  maxParticipants?: number;

  @ApiPropertyOptional({
    description: 'Enable or disable HuggingFace AI detection',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  antiCheatEnabled?: boolean;

  @ApiPropertyOptional({
    description: 'Acceptance threshold % for anti-cheat validation (0-100)',
    example: 70.0,
    default: 70.0,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  antiCheatThreshold?: number;

  @ApiPropertyOptional({
    description: 'Number of top participants to display (preselection)',
    example: 5,
    default: 5,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  topN?: number;
}

// ─────────────────────────────────────────────────────────────────
// UPDATE (all fields optional)
// ─────────────────────────────────────────────────────────────────

export class UpdateCompetitionDto extends PartialType(CreateCompetitionDto) {}

// ─────────────────────────────────────────────────────────────────
// CHANGE STATUS
// ─────────────────────────────────────────────────────────────────

export class ChangeCompetitionStatusDto {
  @ApiProperty({
    description:
      'New lifecycle status — must follow the allowed transition chain',
    enum: CompetitionStatus,
    example: CompetitionStatus.OPEN_FOR_ENTRY,
  })
  @IsEnum(CompetitionStatus, {
    message:
      'status must be one of: SCHEDULED, OPEN_FOR_ENTRY, RUNNING, SUBMISSION_CLOSED, EVALUATING, COMPLETED, ARCHIVED',
  })
  status: CompetitionStatus;
}

// ─────────────────────────────────────────────────────────────────
// JOIN
// ─────────────────────────────────────────────────────────────────

export class JoinCompetitionDto {
  // Reserved for future expansion (team name, cover letter, etc.)
}

// ─────────────────────────────────────────────────────────────────
// QUERY / FILTER
// ─────────────────────────────────────────────────────────────────

export class CompetitionQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by competition status',
    enum: CompetitionStatus,
    example: CompetitionStatus.OPEN_FOR_ENTRY,
  })
  @IsOptional()
  @IsEnum(CompetitionStatus)
  status?: CompetitionStatus;

  @ApiPropertyOptional({
    description: 'Filter by difficulty',
    enum: CompetitionDifficulty,
    example: CompetitionDifficulty.HARD,
  })
  @IsOptional()
  @IsEnum(CompetitionDifficulty)
  difficulty?: CompetitionDifficulty;

  @ApiPropertyOptional({
    description: 'Filter by specialty (e.g. FRONTEND, BACKEND)',
    enum: Specialty,
    example: Specialty.FRONTEND,
  })
  @IsOptional()
  @IsEnum(Specialty)
  specialty?: Specialty;

  @ApiPropertyOptional({
    description: 'Return only active competitions',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  onlyActive?: boolean;

  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Results per page',
    example: 10,
    default: 10,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}

// ─────────────────────────────────────────────────────────────────
// SUBMIT WORK (GitHub link)
// ─────────────────────────────────────────────────────────────────

export class SubmitWorkDto {
  @ApiProperty({
    description:
      "Public GitHub repository URL containing the participant's work",
    example: 'https://github.com/user/hackathon-project',
  })
  @IsString()
  @IsNotEmpty()
  githubUrl: string;
}

// ─────────────────────────────────────────────────────────────────
// CHECKPOINT — USER SUBMIT
// ─────────────────────────────────────────────────────────────────

export class SubmitCheckpointDto {
  @ApiProperty({
    description: 'Proof URL (repo link, demo, or document)',
    example: 'https://github.com/user/checkpoint-1',
  })
  @IsString()
  @IsNotEmpty()
  proofUrl: string;

  @ApiPropertyOptional({
    description: 'Optional notes for the submission',
    example: 'Demo link in description',
  })
  @IsOptional()
  @IsString()
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────
// CHECKPOINT — ADMIN REVIEW
// ─────────────────────────────────────────────────────────────────

export class ReviewCheckpointSubmissionDto {
  @ApiProperty({
    description: 'Review outcome',
    enum: ['APPROVED', 'REJECTED'],
    example: 'APPROVED',
  })
  @IsIn(['APPROVED', 'REJECTED'], {
    message: 'status must be APPROVED or REJECTED',
  })
  status: 'APPROVED' | 'REJECTED';
}
