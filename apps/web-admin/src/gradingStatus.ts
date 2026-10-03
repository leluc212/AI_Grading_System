/**
 * Trạng thái chấm bài **dẫn xuất** của 1 nhóm, dùng cho dashboard (task 8.1).
 *
 * Vì sao cần dẫn xuất thay vì đọc thẳng `GradingResult.status`: Requirement
 * 5.1 yêu cầu cột "trạng thái chấm bài" với các giá trị *chưa chấm / đang
 * chấm / đã chấm / lỗi / cần review*. Tập này KHÔNG trùng với
 * `GradingStatus` của model:
 *
 *   - "chưa chấm" không phải 1 `GradingStatus` — nó là trường hợp nhóm chưa
 *     có `GradingResult` nào.
 *   - "cần review" là tổ hợp của `status = GRADED` + `needsReview = true` +
 *     `reviewStatus` chưa phải `REVIEWED` (Requirement 7.1), chứ không phải
 *     1 giá trị status riêng.
 *
 * Gom logic quy đổi vào 1 hàm thuần ở đây để cột hiển thị và bộ lọc
 * (Requirement 5.2) dùng chung đúng 1 định nghĩa — nếu mỗi chỗ tự suy luận
 * thì sẽ có cảnh lọc "cần review" ra 1 nhóm mà cột lại ghi "đã chấm".
 *
 * _Requirements: 5.1, 5.2, 6.6, 7.1_
 */
import type { GradingResult } from '@quick-grading/shared-types';

export type DerivedGradingStatus =
  | 'NOT_GRADED'
  | 'IN_PROGRESS'
  | 'GRADED'
  | 'NEEDS_REVIEW'
  | 'FAILED';

/** Nhãn tiếng Việt cho từng trạng thái dẫn xuất (dùng cả ở cột và ở bộ lọc). */
export const DERIVED_GRADING_STATUS_LABELS: Record<DerivedGradingStatus, string> = {
  NOT_GRADED: 'Chưa chấm',
  IN_PROGRESS: 'Đang chấm',
  GRADED: 'Đã chấm',
  NEEDS_REVIEW: 'Cần review',
  FAILED: 'Lỗi',
};

/** Thứ tự hiển thị trong bộ lọc — theo luồng công việc của Admin, không phải alphabet. */
export const DERIVED_GRADING_STATUS_ORDER: DerivedGradingStatus[] = [
  'NOT_GRADED',
  'IN_PROGRESS',
  'NEEDS_REVIEW',
  'GRADED',
  'FAILED',
];

/**
 * Quy đổi lượt chấm GẦN NHẤT của 1 nhóm thành trạng thái hiển thị.
 *
 * @param latest Lượt chấm gần nhất, hoặc `null` nếu nhóm chưa từng được chấm.
 */
export function deriveGradingStatus(latest: GradingResult | null): DerivedGradingStatus {
  if (latest === null) {
    return 'NOT_GRADED';
  }

  switch (latest.status) {
    case 'PENDING':
    case 'IN_PROGRESS':
      // `PENDING` (đã vào hàng đợi, chưa xử lý) với `IN_PROGRESS` không khác
      // nhau dưới góc nhìn của Admin: cả hai đều là "đang chạy, chờ kết quả".
      return 'IN_PROGRESS';
    case 'FAILED':
      return 'FAILED';
    case 'GRADED':
      // Requirement 7.1: chỉ còn là "cần review" khi Admin CHƯA review xong.
      return latest.needsReview && latest.reviewStatus !== 'REVIEWED' ? 'NEEDS_REVIEW' : 'GRADED';
  }
}

/**
 * Điểm cuối cùng để hiển thị: ưu tiên `finalScore` (điểm sau review), ngược
 * lại dùng `score` của AI (Requirement 7.6). Trả `null` nếu chưa có điểm nào.
 *
 * Dùng `??` chứ không `||` để điểm 0 (hợp lệ) không bị coi là "chưa có điểm".
 */
export function resolveDisplayScore(grading: GradingResult | null): number | null {
  if (grading === null) {
    return null;
  }
  return grading.finalScore ?? grading.score ?? null;
}
