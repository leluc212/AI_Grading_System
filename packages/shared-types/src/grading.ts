/**
 * Grading domain types.
 *
 * See design.md > Data Models for the source-of-truth shape of these types.
 */

export type GradingStatus = 'PENDING' | 'IN_PROGRESS' | 'GRADED' | 'FAILED';

export type ReviewStatus = 'NOT_REQUIRED' | 'PENDING_REVIEW' | 'REVIEWED';

export interface GradingResult {
  teamId: string;
  /** UUID, tang dan theo thoi gian tao */
  gradingAttemptId: string;
  status: GradingStatus;
  score?: number;
  aiFeedback?: string;
  gradedAt?: string;
  gradedBy?: 'AI' | 'ADMIN';
  needsReview: boolean;
  reviewStatus: ReviewStatus;
  reviewedBy?: string;
  finalScore?: number;
  rubricVersion?: number;
  idempotencyKey: string;
  triggeredBy: string;
  /** khi status = FAILED */
  errorMessage?: string;
}
