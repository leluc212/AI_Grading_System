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

export function processGradingScore({
  raw,
  config,
  rubric,
  truncated,
}: ProcessGradingScoreParams): ProcessedGradingScore {
  let finalScore = 0;
  let criteriaMismatch = false;
  const criteriaScores: CriterionScore[] = [];

  const rawFeedback = (raw.feedback ?? '').trim();
  const feedback = rawFeedback.slice(0, MAX_FEEDBACK_LENGTH);

  if (config.mode === 'RUBRIC' || config.mode === 'HYBRID') {
    const rubricCriteria = rubric?.criteria ?? [];
    const rubricMap = new Map(rubricCriteria.map((c) => [c.id, c]));

    const rawCriteriaMap = new Map(raw.criteria?.map((c) => [c.criterionId, c]) ?? []);

    // Kiểm tra có thiếu hoặc thừa tiêu chí không
    if (rubricCriteria.length !== (raw.criteria?.length ?? 0)) {
      criteriaMismatch = true;
    }

    let weightedSum = 0;
    let totalWeight = 0;

    // Tính toán phân bổ trọng số
    const specifiedWeightSum = rubricCriteria.reduce((sum, c) => sum + (c.weight ?? 0), 0);
    const unweightedCount = rubricCriteria.filter(
      (c) => c.weight === undefined || c.weight === null,
    ).length;
    const remainingWeight = Math.max(0, 100 - specifiedWeightSum);
    const defaultWeightPerUnweighted = unweightedCount > 0 ? remainingWeight / unweightedCount : 0;

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

      const effectiveWeight =
        criterion.weight !== undefined && criterion.weight !== null
          ? criterion.weight
          : defaultWeightPerUnweighted;

      weightedSum += criterionScore * effectiveWeight;
      totalWeight += effectiveWeight;
    }

    // Kiểm tra nếu có tiêu chí lạ trong kết quả của model
    for (const c of raw.criteria ?? []) {
      if (!rubricMap.has(c.criterionId)) {
        criteriaMismatch = true;
      }
    }

    if (totalWeight > 0) {
      finalScore = clampScore(weightedSum / totalWeight);
    } else {
      // Nếu không có trọng số nào, lấy trung bình cộng đơn giản
      const sum = criteriaScores.reduce((acc, c) => acc + c.score, 0);
      finalScore = clampScore(criteriaScores.length > 0 ? sum / criteriaScores.length : 0);
    }
  } else {
    // Mode PROMPT
    finalScore = clampScore(raw.totalScore);
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
  }

  // Tiêu chí đánh dấu needsReview:
  // 1. Model tự đề xuất needsReview = true
  // 2. Bài làm bị cắt ngắn do vượt trần input (truncated = true)
  // 3. Điểm số thấp hơn ngưỡng quy định (score < 70)
  // 4. Độ tự tin của mô hình thấp (< 0.6)
  // 5. Sai lệch danh sách tiêu chí Rubric
  const needsReview =
    Boolean(raw.needsReview) ||
    Boolean(truncated) ||
    finalScore < getNeedsReviewThreshold() ||
    (typeof raw.confidence === 'number' && raw.confidence < 0.6) ||
    criteriaMismatch;

  const reviewStatus: ReviewStatus = needsReview ? 'PENDING_REVIEW' : 'NOT_REQUIRED';

  return {
    score: finalScore,
    feedback,
    needsReview,
    reviewStatus,
    criteriaScores,
  };
}
