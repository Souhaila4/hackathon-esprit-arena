import {
  CompetitionStatus,
  CompetitionDifficulty,
  ParticipantStatus,
} from '@prisma/client';

// Re-export Prisma enums for use throughout the module
export { CompetitionStatus, CompetitionDifficulty, ParticipantStatus };

/**
 * Defines the ONLY valid status transitions for the competition lifecycle.
 *
 * SCHEDULED → OPEN_FOR_ENTRY → RUNNING → SUBMISSION_CLOSED → EVALUATING → COMPLETED → ARCHIVED
 */
export const VALID_STATUS_TRANSITIONS: Record<
  CompetitionStatus,
  CompetitionStatus[]
> = {
  [CompetitionStatus.SCHEDULED]: [CompetitionStatus.OPEN_FOR_ENTRY],
  [CompetitionStatus.OPEN_FOR_ENTRY]: [CompetitionStatus.RUNNING],
  [CompetitionStatus.RUNNING]: [CompetitionStatus.SUBMISSION_CLOSED],
  [CompetitionStatus.SUBMISSION_CLOSED]: [CompetitionStatus.EVALUATING],
  [CompetitionStatus.EVALUATING]: [CompetitionStatus.COMPLETED],
  [CompetitionStatus.COMPLETED]: [CompetitionStatus.ARCHIVED],
  [CompetitionStatus.ARCHIVED]: [],
};
