/**
 * Unit test cho `gradingApi` (task 4.3) — happy path + lỗi bắt buộc:
 * grading đang chạy (GradingInProgressError).
 *
 * Chạy qua MSW server thật (xem `test/setup.ts`).
 *
 * Lưu ý xử lý bất đồng bộ: handler `triggerGrading` trả 202 IN_PROGRESS
 * NGAY, rồi hoàn tất qua `setTimeout` (~1.5-2s) với ~10% ra FAILED. Để tránh
 * flaky, các test KHÔNG chờ kết quả GRADED tự nhiên: test in-progress chỉ
 * gọi 2 lần liên tiếp (lần 2 chắc chắn thấy IN_PROGRESS vì timer chưa chạy);
 * test review dựng sẵn trạng thái GRADED một cách tất định bằng cách sửa
 * trực tiếp store qua `getDb()` rồi mới gọi `submitReview`.
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  GradingInProgressError,
  NotFoundError,
  ValidationError,
} from '@quick-grading/shared-types';
import { getDb, resetMockDb } from '@quick-grading/mock-server';
import { gradingApi } from '../src/index.js';
import { TEAM_OPEN_ID, TEAM_SUBMITTED_ID } from './helpers.js';

const ADMIN_ID = 'admin';

beforeEach(() => {
  resetMockDb();
});

describe('gradingApi - triggerGrading', () => {
  it('nhóm đã nộp đủ 2 file -> tạo lượt chấm IN_PROGRESS', async () => {
    const result = await gradingApi.triggerGrading(TEAM_SUBMITTED_ID, ADMIN_ID);
    expect(result.teamId).toBe(TEAM_SUBMITTED_ID);
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.gradingAttemptId).toBeTruthy();
    expect(result.triggeredBy).toBe(ADMIN_ID);
  });

  it('gọi lần 2 khi đang IN_PROGRESS -> ném GradingInProgressError', async () => {
    // Lần 1: 202 IN_PROGRESS (đồng bộ, trước khi setTimeout hoàn tất chấm).
    const first = await gradingApi.triggerGrading(TEAM_SUBMITTED_ID, ADMIN_ID);
    expect(first.status).toBe('IN_PROGRESS');

    // Lần 2: vẫn còn 1 lượt IN_PROGRESS -> bị chặn.
    await expect(gradingApi.triggerGrading(TEAM_SUBMITTED_ID, ADMIN_ID)).rejects.toBeInstanceOf(
      GradingInProgressError,
    );
  });

  it('nhóm chưa nộp đủ 2 file -> ném ValidationError', async () => {
    await expect(gradingApi.triggerGrading(TEAM_OPEN_ID, ADMIN_ID)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('team không tồn tại -> ném NotFoundError', async () => {
    await expect(gradingApi.triggerGrading('khong-ton-tai', ADMIN_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('gradingApi - history / latest', () => {
  it('sau khi trigger: history có 1 entry và getLatestGrading trả về nó', async () => {
    const triggered = await gradingApi.triggerGrading(TEAM_SUBMITTED_ID, ADMIN_ID);

    const history = await gradingApi.listGradingHistory(TEAM_SUBMITTED_ID);
    expect(history).toHaveLength(1);
    expect(history[0].gradingAttemptId).toBe(triggered.gradingAttemptId);

    const latest = await gradingApi.getLatestGrading(TEAM_SUBMITTED_ID);
    expect(latest?.gradingAttemptId).toBe(triggered.gradingAttemptId);
  });

  it('getLatestGrading trả null cho nhóm chưa từng chấm', async () => {
    const latest = await gradingApi.getLatestGrading(TEAM_OPEN_ID);
    expect(latest).toBeNull();
  });
});

describe('gradingApi - submitReview', () => {
  it('happy path: đặt finalScore, giữ nguyên score gốc, reviewStatus = REVIEWED', async () => {
    const triggered = await gradingApi.triggerGrading(TEAM_SUBMITTED_ID, ADMIN_ID);

    // Dựng trạng thái GRADED một cách tất định (thay cho async setTimeout).
    const stored = getDb().gradingResults.find(
      (g) => g.gradingAttemptId === triggered.gradingAttemptId,
    );
    expect(stored).toBeDefined();
    stored!.status = 'GRADED';
    stored!.score = 85;
    stored!.gradedBy = 'AI';
    stored!.gradedAt = new Date().toISOString();

    const reviewed = await gradingApi.submitReview(TEAM_SUBMITTED_ID, triggered.gradingAttemptId, {
      reviewedBy: 'admin',
      finalScore: 90,
    });

    expect(reviewed.reviewStatus).toBe('REVIEWED');
    expect(reviewed.reviewedBy).toBe('admin');
    expect(reviewed.finalScore).toBe(90);
    // score gốc của AI không bị chạm tới.
    expect(reviewed.score).toBe(85);
  });

  it('gradingAttemptId không tồn tại -> ném NotFoundError', async () => {
    await expect(
      gradingApi.submitReview(TEAM_SUBMITTED_ID, 'khong-ton-tai', { reviewedBy: 'admin' }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('thiếu reviewedBy -> ném ValidationError', async () => {
    const triggered = await gradingApi.triggerGrading(TEAM_SUBMITTED_ID, ADMIN_ID);
    await expect(
      gradingApi.submitReview(TEAM_SUBMITTED_ID, triggered.gradingAttemptId, { reviewedBy: '' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
