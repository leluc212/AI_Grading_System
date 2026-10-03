/**
 * Thang điểm và thang trọng số của hệ thống — NGUỒN DUY NHẤT.
 *
 * `docs/project-context.md` mục 6 ghi "Admin cung cấp rubric (tiêu chí + thang
 * điểm) — cần xác định", tức là thang điểm là một quyết định còn mở. Trước khi
 * có file này, con số 100 bị lặp lại độc lập ở 3 nơi thuộc 2 package
 * (`ReviewPanel`, `rubricDraft`, mock grading handler) và chẳng có gì bắt chúng
 * phải khớp nhau — đổi thang điểm nghĩa là đi sửa 3 chỗ và cầu mong không bỏ
 * sót. Giờ cả 3 đọc từ đây.
 *
 * ## Vì sao điểm và trọng số là HAI thang khác nhau
 *
 * Trọng số tiêu chí rubric là **phần trăm** (tổng mong đợi 100%), còn thang
 * điểm là thang điểm của trường. Hai thứ này tình cờ cùng là 100 ở cấu hình
 * hiện tại, nhưng chúng độc lập: nếu đổi sang thang điểm 10, trọng số vẫn phải
 * là 0-100%. Gộp chúng vào 1 hằng số sẽ tạo ra lỗi ngay lần đầu đổi thang điểm.
 *
 * _Requirements: 7.4, 9.1_
 */

/**
 * Thang điểm của 1 lượt chấm.
 *
 * Đổi `max` ở đây là đổi toàn hệ thống: ô nhập điểm khi Admin review, ngưỡng
 * `needsReview`, và khoảng điểm mà mock AI Grader sinh ra.
 *
 * Chọn 0-100 vì quy đổi về thang 10 của trường chỉ là chia 10 (không mất độ
 * chính xác), còn chiều ngược lại thì mất.
 */
export const GRADING_SCALE = {
  min: 0,
  max: 100,
} as const;

/**
 * Thang trọng số cho từng tiêu chí rubric, tính theo phần trăm.
 *
 * `expectedTotal` chỉ dùng để CẢNH BÁO khi tổng trọng số lệch, không phải ràng
 * buộc chặn lưu: `requirements.md` không quy định tổng phải bằng 100, và
 * `RubricCriterion.weight` vốn là field tuỳ chọn.
 */
export const RUBRIC_WEIGHT_PERCENT = {
  min: 0,
  max: 100,
  expectedTotal: 100,
} as const;

/**
 * Tỷ lệ ngưỡng để AI (giả lập) đánh dấu `needsReview`: điểm dưới 70% thang điểm
 * thì đề xuất Admin xem lại.
 *
 * Đây là quy tắc STUB của giai đoạn 1. Giai đoạn 3, AI Grader thật sẽ tự quyết
 * `needsReview` theo `Rubric.reviewFlagRules` (hiện để trống, chờ chốt sau khi
 * spike API Amazon Quick) — lúc đó hằng số này không còn dùng.
 */
export const NEEDS_REVIEW_THRESHOLD_RATIO = 0.7;

/**
 * Ngưỡng điểm tuyệt đối để đánh dấu `needsReview`, suy ra từ thang điểm.
 *
 * Dùng hàm thay vì hằng số tính sẵn để nếu `GRADING_SCALE.max` đổi thì ngưỡng
 * tự đổi theo, không ai phải nhớ cập nhật 2 chỗ.
 */
export function getNeedsReviewThreshold(): number {
  return Math.round(GRADING_SCALE.max * NEEDS_REVIEW_THRESHOLD_RATIO);
}

/**
 * True nếu `score` nằm trong thang điểm hợp lệ.
 *
 * Dùng chung cho validate ở UI (Admin sửa điểm) và ở server, để hai phía không
 * bao giờ bất đồng về việc điểm nào là hợp lệ.
 */
export function isScoreInScale(score: number): boolean {
  return Number.isFinite(score) && score >= GRADING_SCALE.min && score <= GRADING_SCALE.max;
}

/**
 * True nếu `weight` là trọng số phần trăm hợp lệ cho 1 tiêu chí rubric.
 */
export function isWeightInScale(weight: number): boolean {
  return (
    Number.isFinite(weight) &&
    weight >= RUBRIC_WEIGHT_PERCENT.min &&
    weight <= RUBRIC_WEIGHT_PERCENT.max
  );
}
