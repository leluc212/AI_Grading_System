/**
 * Hậu xử lý và chuẩn hóa điểm số từ kết quả AI (infra-plan mục 6.3).
 *
 * Server tự tính lại điểm theo trọng số, kẹp thang điểm và quyết định needsReview,
 * không tin cậy trực tiếp phép tính của mô hình.
 */
import {
  GRADING_SCALE,
  getNeedsReviewThreshold,
  MAX_FEEDBACK_LENGTH,
  MAX_COMMENT_LENGTH,
} from '@quick-grading/shared-types';
import type {
  GradingConfig,
  Rubric,
  ReviewStatus,
  CriterionScore,
} from '@quick-grading/shared-types';
import type { RawAiGradingOutput } from './outputSchema.js';

export interface ProcessGradingScoreParams {
  raw: RawAiGradingOutput;
  config: GradingConfig;
  rubric?: Rubric;
  truncated: boolean;
}

export interface ProcessedGradingScore {
  score: number;
  feedback: string;
  needsReview: boolean;
  reviewStatus: ReviewStatus;
  criteriaScores: CriterionScore[];
}

function clampScore(val: number): number {
  if (!Number.isFinite(val)) return GRADING_SCALE.min;
  const clamped = Math.min(GRADING_SCALE.max, Math.max(GRADING_SCALE.min, val));
  return Math.round(clamped * 10) / 10;
}

interface RubricScoreResult {
  finalScore: number;
  criteriaMismatch: boolean;
  criteriaScores: CriterionScore[];
}

function calculateRubricScores(
  rubricCriteria: NonNullable<Rubric['criteria']>,
  rawCriteria: NonNullable<RawAiGradingOutput['criteria']>,
): RubricScoreResult {
  const rubricMap = new Map(rubricCriteria.map((c) => [c.id, c]));
  const rawCriteriaMap = new Map(rawCriteria.map((c) => [c.criterionId, c]));
  let criteriaMismatch = rubricCriteria.length !== rawCriteria.length;

  const specifiedWeightSum = rubricCriteria.reduce((sum, c) => sum + (c.weight ?? 0), 0);
  const unweightedCount = rubricCriteria.filter(
    (c) => c.weight === undefined || c.weight === null,
  ).length;
  const remainingWeight = Math.max(0, 100 - specifiedWeightSum);
  const defaultWeight = unweightedCount > 0 ? remainingWeight / unweightedCount : 0;

  let weightedSum = 0;
  let totalWeight = 0;
  const criteriaScores: CriterionScore[] = [];

  for (const criterion of rubricCriteria) {
    const rawC = rawCriteriaMap.get(criterion.id);
    if (!rawC) {
      criteriaMismatch = true;
    }
    const criterionScore = clampScore(rawC?.score ?? 0);
    const criterionComment = (rawC?.comment ?? '').trim().slice(0, MAX_COMMENT_LENGTH);

    criteriaScores.push({
      criterionId: criterion.id,
      label: criterion.label,
      score: criterionScore,
      comment: criterionComment,
    });

    const effectiveWeight = criterion.weight ?? defaultWeight;

    weightedSum += criterionScore * effectiveWeight;
    totalWeight += effectiveWeight;
  }

  for (const c of rawCriteria) {
    if (!rubricMap.has(c.criterionId)) {
      criteriaMismatch = true;
    }
  }

  let finalScore = 0;
  if (totalWeight > 0) {
    finalScore = clampScore(weightedSum / totalWeight);
  } else {
    const sum = criteriaScores.reduce((acc, c) => acc + c.score, 0);
    finalScore = clampScore(criteriaScores.length > 0 ? sum / criteriaScores.length : 0);
  }

  return { finalScore, criteriaMismatch, criteriaScores };
}

function calculatePromptScores(raw: RawAiGradingOutput): {
  finalScore: number;
  criteriaScores: CriterionScore[];
} {
  const finalScore = clampScore(raw.totalScore);
  const criteriaScores: CriterionScore[] = [];
  if (Array.isArray(raw.criteria)) {
    for (const c of raw.criteria) {
      criteriaScores.push({
        criterionId: c.criterionId,
        label: c.criterionId,
        score: clampScore(c.score),
        comment: (c.comment ?? '').trim().slice(0, MAX_COMMENT_LENGTH),
      });
    }
  }
  return { finalScore, criteriaScores };
}

function checkNeedsReview(
  raw: RawAiGradingOutput,
  finalScore: number,
  criteriaMismatch: boolean,
  truncated: boolean,
): boolean {
  return (
    Boolean(raw.needsReview) ||
    Boolean(truncated) ||
    finalScore < getNeedsReviewThreshold() ||
    (typeof raw.confidence === 'number' && raw.confidence < 0.6) ||
    criteriaMismatch
  );
}

export function processGradingScore({
  raw,
  config,
  rubric,
  truncated,
}: ProcessGradingScoreParams): ProcessedGradingScore {
  const rawFeedback = (raw.feedback ?? '').trim();
  const feedback = rawFeedback.slice(0, MAX_FEEDBACK_LENGTH);

  let finalScore = 0;
  let criteriaMismatch = false;
  let criteriaScores: CriterionScore[] = [];

  if (config.mode === 'RUBRIC' || config.mode === 'HYBRID') {
    const res = calculateRubricScores(rubric?.criteria ?? [], raw.criteria ?? []);
    finalScore = res.finalScore;
    criteriaMismatch = res.criteriaMismatch;
    criteriaScores = res.criteriaScores;
  } else {
    const res = calculatePromptScores(raw);
    finalScore = res.finalScore;
    criteriaScores = res.criteriaScores;
  }

  const needsReview = checkNeedsReview(raw, finalScore, criteriaMismatch, truncated);
  const reviewStatus: ReviewStatus = needsReview ? 'PENDING_REVIEW' : 'NOT_REQUIRED';

  return {
    score: finalScore,
    feedback,
    needsReview,
    reviewStatus,
    criteriaScores,
  };
}
