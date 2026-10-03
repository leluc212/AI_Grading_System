/**
 * Unit test cho quy đổi trạng thái chấm bài dẫn xuất (task 8.1).
 *
 * Đây là logic nghiệp vụ quyết định cả cột "trạng thái chấm bài" và bộ lọc
 * (Requirement 5.1, 5.2), nên kiểm ở mức hàm thuần — đúng/sai ở đây không phụ
 * thuộc UI render thế nào.
 */
import { describe, expect, it } from 'vitest';
import { deriveGradingStatus, resolveDisplayScore } from '../src/gradingStatus';
import { makeGradingResult } from './fixtures';

describe('deriveGradingStatus', () => {
  it('nhóm chưa từng được chấm là "chưa chấm"', () => {
    expect(deriveGradingStatus(null)).toBe('NOT_GRADED');
  });

  it('coi PENDING và IN_PROGRESS như nhau là "đang chấm"', () => {
    // Dưới góc nhìn Admin, "đã vào hàng đợi" và "đang chạy" không khác gì nhau.
    expect(deriveGradingStatus(makeGradingResult({ status: 'PENDING' }))).toBe('IN_PROGRESS');
    expect(deriveGradingStatus(makeGradingResult({ status: 'IN_PROGRESS' }))).toBe('IN_PROGRESS');
  });

  it('lượt chấm lỗi là "lỗi"', () => {
    expect(deriveGradingStatus(makeGradingResult({ status: 'FAILED' }))).toBe('FAILED');
  });

  it('chấm xong và không cần review là "đã chấm"', () => {
    expect(
      deriveGradingStatus(
        makeGradingResult({ status: 'GRADED', needsReview: false, reviewStatus: 'NOT_REQUIRED' }),
      ),
    ).toBe('GRADED');
  });

  it('chấm xong, cần review và chưa review xong là "cần review"', () => {
    expect(
      deriveGradingStatus(
        makeGradingResult({ status: 'GRADED', needsReview: true, reviewStatus: 'PENDING_REVIEW' }),
      ),
    ).toBe('NEEDS_REVIEW');
  });

  it('đã review rồi thì về lại "đã chấm" dù needsReview vẫn bật', () => {
    // Requirement 7.1: danh sách "cần review" chỉ còn việc chưa xử lý. Cờ
    // `needsReview` là đề xuất của AI và không bị xoá sau khi review, nên nếu
    // chỉ xét cờ đó thì nhóm đã review xong sẽ mắc lại trong bộ lọc mãi mãi.
    expect(
      deriveGradingStatus(
        makeGradingResult({ status: 'GRADED', needsReview: true, reviewStatus: 'REVIEWED' }),
      ),
    ).toBe('GRADED');
  });
});

describe('resolveDisplayScore', () => {
  it('trả null khi chưa có lượt chấm nào', () => {
    expect(resolveDisplayScore(null)).toBeNull();
  });

  it('ưu tiên finalScore khi Admin đã sửa điểm (Requirement 7.6)', () => {
    expect(resolveDisplayScore(makeGradingResult({ score: 85, finalScore: 90 }))).toBe(90);
  });

  it('dùng score của AI khi chưa có finalScore', () => {
    expect(resolveDisplayScore(makeGradingResult({ score: 85, finalScore: undefined }))).toBe(85);
  });

  it('coi finalScore = 0 là điểm hợp lệ, không rơi về score', () => {
    // Dùng `??` chứ không `||` chính là để case này đúng.
    expect(resolveDisplayScore(makeGradingResult({ score: 85, finalScore: 0 }))).toBe(0);
  });

  it('trả null khi lượt chấm chưa có điểm (ví dụ đang chạy hoặc lỗi)', () => {
    expect(
      resolveDisplayScore(
        makeGradingResult({ status: 'IN_PROGRESS', score: undefined, finalScore: undefined }),
      ),
    ).toBeNull();
  });
});
