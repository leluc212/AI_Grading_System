/**
 * Test thang điểm dùng chung ở `@quick-grading/shared-types`.
 *
 * Đặt ở `api-client` (không phải `shared-types`) vì package đó chỉ có types +
 * hằng số, chưa dựng test runner; còn ở đây đã có Vitest + MSW nên kiểm được cả
 * hằng số VÀ việc mock handler thật có tôn trọng thang điểm hay không — thứ
 * đáng kiểm hơn là bản thân mấy phép so sánh.
 *
 * _Requirements: 7.4, 9.1_
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRADING_SCALE,
  NEEDS_REVIEW_THRESHOLD_RATIO,
  RUBRIC_WEIGHT_PERCENT,
  getNeedsReviewThreshold,
  isScoreInScale,
  isWeightInScale,
} from '@quick-grading/shared-types';
import { resetMockDb } from '@quick-grading/mock-server';
import { gradingApi, teamsApi } from '../src/index.js';
import { TEAM_SUBMITTED_ID } from './helpers.js';

describe('GRADING_SCALE', () => {
  it('là một khoảng hợp lệ', () => {
    expect(GRADING_SCALE.min).toBeLessThan(GRADING_SCALE.max);
  });

  it('isScoreInScale nhận hai biên và từ chối ngoài khoảng', () => {
    expect(isScoreInScale(GRADING_SCALE.min)).toBe(true);
    expect(isScoreInScale(GRADING_SCALE.max)).toBe(true);
    expect(isScoreInScale(GRADING_SCALE.min - 1)).toBe(false);
    expect(isScoreInScale(GRADING_SCALE.max + 1)).toBe(false);
  });

  it('isScoreInScale từ chối NaN và Infinity', () => {
    expect(isScoreInScale(Number.NaN)).toBe(false);
    expect(isScoreInScale(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('RUBRIC_WEIGHT_PERCENT', () => {
  it('độc lập với thang điểm — trọng số luôn là phần trăm', () => {
    // Chốt bằng test để lần sau có ai đổi `GRADING_SCALE.max` sang 10 thì
    // không kéo luôn thang trọng số xuống 0-10 (sẽ sai, vì weight là %).
    expect(RUBRIC_WEIGHT_PERCENT.max).toBe(100);
    expect(RUBRIC_WEIGHT_PERCENT.expectedTotal).toBe(100);
  });

  it('isWeightInScale nhận hai biên và từ chối ngoài khoảng', () => {
    expect(isWeightInScale(0)).toBe(true);
    expect(isWeightInScale(100)).toBe(true);
    expect(isWeightInScale(-1)).toBe(false);
    expect(isWeightInScale(101)).toBe(false);
  });
});

describe('getNeedsReviewThreshold', () => {
  it('suy ra từ thang điểm theo đúng tỷ lệ', () => {
    expect(getNeedsReviewThreshold()).toBe(
      Math.round(GRADING_SCALE.max * NEEDS_REVIEW_THRESHOLD_RATIO),
    );
  });

  it('nằm trong thang điểm', () => {
    expect(isScoreInScale(getNeedsReviewThreshold())).toBe(true);
  });
});

describe('Mock AI Grader tôn trọng thang điểm', () => {
  beforeEach(() => {
    resetMockDb();
  });

  /** Chờ lượt chấm rời trạng thái đang chạy. */
  async function waitForSettle(teamId: string) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const latest = await gradingApi.getLatestGrading(teamId);
      if (latest !== null && latest.status !== 'IN_PROGRESS' && latest.status !== 'PENDING') {
        return latest;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Lượt chấm không hoàn tất trong thời gian chờ.');
  }

  it.each([0, 0.25, 0.5, 0.75, 0.999])(
    'điểm sinh ra luôn nằm trong thang điểm (Math.random = %s)',
    async (randomValue) => {
      // 0.25 trở lên để không rơi vào nhánh lỗi giả lập (<0.1); riêng 0 thì
      // handler trả FAILED nên không có điểm để kiểm.
      vi.spyOn(Math, 'random').mockReturnValue(randomValue);

      await gradingApi.triggerGrading(TEAM_SUBMITTED_ID, 'admin');
      const settled = await waitForSettle(TEAM_SUBMITTED_ID);

      if (settled.status === 'GRADED') {
        expect(settled.score).toBeDefined();
        // Test này sẽ đỏ nếu ai đổi `GRADING_SCALE.max` mà quên sửa công thức
        // sinh điểm giả lập trong mock handler.
        expect(isScoreInScale(settled.score as number)).toBe(true);
      } else {
        expect(settled.status).toBe('FAILED');
      }

      vi.restoreAllMocks();
    },
  );

  it('needsReview bật đúng theo ngưỡng suy ra từ thang điểm', async () => {
    // random = 0.2: không lỗi (>0.1), điểm = 60% thang + floor(0.2 * span).
    vi.spyOn(Math, 'random').mockReturnValue(0.2);

    await gradingApi.triggerGrading(TEAM_SUBMITTED_ID, 'admin');
    const settled = await waitForSettle(TEAM_SUBMITTED_ID);

    expect(settled.status).toBe('GRADED');
    const score = settled.score as number;
    expect(settled.needsReview).toBe(score < getNeedsReviewThreshold());

    vi.restoreAllMocks();
  });

  it('Admin sửa điểm ở biên trên của thang thì server nhận', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await gradingApi.triggerGrading(TEAM_SUBMITTED_ID, 'admin');
    const settled = await waitForSettle(TEAM_SUBMITTED_ID);
    vi.restoreAllMocks();

    const reviewed = await gradingApi.submitReview(TEAM_SUBMITTED_ID, settled.gradingAttemptId, {
      reviewedBy: 'admin',
      finalScore: GRADING_SCALE.max,
    });

    expect(reviewed.finalScore).toBe(GRADING_SCALE.max);
    // Điểm gốc của AI không bị chạm tới (Property 5).
    expect(reviewed.score).toBe(settled.score);
  });

  it('nhóm seed vẫn nộp được bình thường (sanity check cho helpers)', async () => {
    const team = await teamsApi.getTeam(TEAM_SUBMITTED_ID);
    expect(team.status).toBe('SUBMITTED');
  });
});
