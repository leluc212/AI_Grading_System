/**
 * Grading domain types.
 *
 * See design.md > Data Models for the source-of-truth shape of these types.
 */

export type GradingStatus = 'PENDING' | 'IN_PROGRESS' | 'GRADED' | 'FAILED';

export type ReviewStatus = 'NOT_REQUIRED' | 'PENDING_REVIEW' | 'REVIEWED';

export type GradingMode = 'RUBRIC' | 'PROMPT' | 'HYBRID';

export interface GradingConfig {
  configId: 'default';
  version: number;
  mode: GradingMode;
  /** Bắt buộc với PROMPT/HYBRID, <= 8.000 ký tự */
  systemPrompt?: string;
  /** Trống = dùng SSM /quick-grading/{stage}/openai/model (mặc định gpt-6.1-sol) */
  model?: string;
  /** Chỉ gửi nếu model hỗ trợ */
  reasoningEffort?: 'low' | 'medium';
  /** Mặc định 50_000 */
  maxInputTokens: number;
  /** Mặc định 2_000 */
  maxOutputTokens: number;
  /** Mặc định false */
  autoGradeOnSubmit: boolean;
  isActive: boolean;
  createdAt: string;
  createdBy: string;
}

export interface CriterionScore {
  criterionId: string;
  label: string;
  score: number;
  comment: string;
}

export interface GradingUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

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
  gradingConfigVersion?: number;
  gradingMode?: GradingMode;
  model?: string;
  truncated?: boolean;
  criteriaScores?: CriterionScore[];
  usage?: GradingUsage;
}
