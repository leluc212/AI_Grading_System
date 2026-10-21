import { describe, it, expect } from 'vitest';
import type { GradingConfig, Rubric } from '@quick-grading/shared-types';
import { processGradingScore } from '../../src/grading/scoring.js';
import type { RawAiGradingOutput } from '../../src/grading/outputSchema.js';

describe('scoring', () => {
  const sampleRubric: Rubric = {
    rubricId: 'default',
    version: 1,
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    criteria: [
      { id: 'c1', label: 'Tiêu chí 1', weight: 40 },
      { id: 'c2', label: 'Tiêu chí 2', weight: 60 },
    ],
  };

  const sampleRubricConfig: GradingConfig = {
    configId: 'default',
    version: 1,
    mode: 'RUBRIC',
    maxInputTokens: 50_000,
    maxOutputTokens: 2_000,
    autoGradeOnSubmit: false,
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    createdBy: 'admin',
  };

  it('tính điểm trung bình có trọng số chính xác trong mode RUBRIC', () => {
    // c1: 80 (weight 40%) -> 32
    // c2: 90 (weight 60%) -> 54
    // total: 86
    const raw: RawAiGradingOutput = {
      criteria: [
        { criterionId: 'c1', score: 80, comment: 'Tốt' },
        { criterionId: 'c2', score: 90, comment: 'Rất tốt' },
      ],
      totalScore: 70, // Server tự tính lại theo trọng số, bỏ qua số này
      feedback: 'Bài làm đạt yêu cầu',
      needsReview: false,
      needsReviewReason: '',
      confidence: 0.95,
    };

    const res = processGradingScore({
      raw,
      config: sampleRubricConfig,
      rubric: sampleRubric,
      truncated: false,
    });

    expect(res.score).toBe(86);
    expect(res.needsReview).toBe(false);
    expect(res.reviewStatus).toBe('NOT_REQUIRED');
    expect(res.criteriaScores).toHaveLength(2);
    expect(res.criteriaScores[0]?.label).toBe('Tiêu chí 1');
    expect(res.criteriaScores[1]?.label).toBe('Tiêu chí 2');
  });

  it('kẹp điểm trong khoảng 0 - 100', () => {
    const raw: RawAiGradingOutput = {
      criteria: [
        { criterionId: 'c1', score: 150, comment: 'Vượt trần' },
        { criterionId: 'c2', score: -20, comment: 'Dưới sàn' },
      ],
      totalScore: 999,
      feedback: 'Test',
      needsReview: false,
      needsReviewReason: '',
      confidence: 1.0,
    };

    const res = processGradingScore({
      raw,
      config: sampleRubricConfig,
      rubric: sampleRubric,
      truncated: false,
    });

    // c1 = 100 (40%) = 40, c2 = 0 (60%) = 0 -> total = 40
    expect(res.score).toBe(40);
    // Điểm 40 < 70 -> needsReview = true
    expect(res.needsReview).toBe(true);
    expect(res.reviewStatus).toBe('PENDING_REVIEW');
  });

  it('bật needsReview khi bài bị cắt ngắn (truncated = true)', () => {
    const raw: RawAiGradingOutput = {
      criteria: [
        { criterionId: 'c1', score: 95, comment: 'Tốt' },
        { criterionId: 'c2', score: 95, comment: 'Tốt' },
      ],
      totalScore: 95,
      feedback: 'Xuất sắc',
      needsReview: false,
      needsReviewReason: '',
      confidence: 0.9,
    };

    const res = processGradingScore({
      raw,
      config: sampleRubricConfig,
      rubric: sampleRubric,
      truncated: true,
    });

    expect(res.score).toBe(95);
    expect(res.needsReview).toBe(true);
    expect(res.reviewStatus).toBe('PENDING_REVIEW');
  });

  it('bật needsReview khi độ tự tin confidence < 0.6', () => {
    const raw: RawAiGradingOutput = {
      criteria: [
        { criterionId: 'c1', score: 85, comment: 'Ổn' },
        { criterionId: 'c2', score: 85, comment: 'Ổn' },
      ],
      totalScore: 85,
      feedback: 'Không chắc chắn',
      needsReview: false,
      needsReviewReason: '',
      confidence: 0.5,
    };

    const res = processGradingScore({
      raw,
      config: sampleRubricConfig,
      rubric: sampleRubric,
      truncated: false,
    });

    expect(res.needsReview).toBe(true);
    expect(res.reviewStatus).toBe('PENDING_REVIEW');
  });

  it('bật needsReview khi tiêu chí trả về bị thiếu hoặc có tiêu chí lạ', () => {
    const raw: RawAiGradingOutput = {
      criteria: [
        { criterionId: 'c1', score: 90, comment: 'Ổn' },
        { criterionId: 'unknown_c', score: 90, comment: 'Lạ' },
      ],
      totalScore: 90,
      feedback: 'Lệch tiêu chí',
      needsReview: false,
      needsReviewReason: '',
      confidence: 0.9,
    };

    const res = processGradingScore({
      raw,
      config: sampleRubricConfig,
      rubric: sampleRubric,
      truncated: false,
    });

    expect(res.needsReview).toBe(true);
  });

  it('cắt ngắn feedback tối đa 2000 ký tự và comment tối đa 300 ký tự', () => {
    const raw: RawAiGradingOutput = {
      criteria: [
        { criterionId: 'c1', score: 80, comment: 'X'.repeat(500) },
        { criterionId: 'c2', score: 80, comment: 'Y'.repeat(500) },
      ],
      totalScore: 80,
      feedback: 'Z'.repeat(3000),
      needsReview: false,
      needsReviewReason: '',
      confidence: 0.9,
    };

    const res = processGradingScore({
      raw,
      config: sampleRubricConfig,
      rubric: sampleRubric,
      truncated: false,
    });

    expect(res.feedback.length).toBe(2000);
    expect(res.criteriaScores[0]?.comment.length).toBe(300);
    expect(res.criteriaScores[1]?.comment.length).toBe(300);
  });

  it('chế độ PROMPT nhận totalScore trực tiếp từ model', () => {
    const promptConfig: GradingConfig = {
      ...sampleRubricConfig,
      mode: 'PROMPT',
      systemPrompt: 'Chấm tự do',
    };

    const raw: RawAiGradingOutput = {
      criteria: [],
      totalScore: 78.5,
      feedback: 'Đạt',
      needsReview: false,
      needsReviewReason: '',
      confidence: 0.85,
    };

    const res = processGradingScore({
      raw,
      config: promptConfig,
      truncated: false,
    });

    expect(res.score).toBe(78.5);
    expect(res.needsReview).toBe(false);
  });
});
