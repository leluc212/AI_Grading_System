/**
 * Dữ liệu được chuyển từ form nộp bài sang trang thông báo thành công
 * (task 5.6).
 *
 * Truyền qua `location.state` của React Router thay vì query string hay 1
 * lần gọi API nữa, vì:
 *   - Thông tin này chỉ dùng để hiển thị lại thứ VỪA nộp, không phải nguồn
 *     dữ liệu cần tra cứu — gọi API lần nữa là dư.
 *   - Requirement 11.1: khu vực public không được đọc dữ liệu nhóm; dựa vào
 *     state sẵn có tránh phải thêm endpoint đọc cho Submitter.
 *
 * Hệ quả cần xử lý: `location.state` có thể là `null` (người dùng vào thẳng
 * `/submit-success`, hoặc F5 ở trang đó). Khi đó KHÔNG được hiển thị "nộp bài
 * thành công" vì không có gì chứng minh điều đó đã xảy ra — xem
 * `SubmitSuccessPage`.
 */

export interface SubmitSuccessState {
  /** Tên nhóm đúng như server đã ghi nhận (đã chuẩn hoá khoảng trắng). */
  teamName: string;
  /** Tên đợt chấm, để trang thành công nói rõ đã nộp vào đâu. */
  assignmentName: string;
  /** Tên 2 file server ghi nhận, để nhóm tự đối chiếu đã nộp đúng file chưa. */
  fileNames: string[];
  /**
   * `true` nếu đây là lần NỘP LẠI (nhóm đã được Admin mở khoá), `false` nếu
   * là lần nộp đầu. Dùng để trang thành công nói đúng việc vừa xảy ra —
   * "đã nộp lại" khác "đã nộp" ở chỗ bản nộp trước đã bị thay thế.
   */
  resubmitted: boolean;
}

/**
 * Type guard cho `location.state`.
 *
 * `location.state` có kiểu `any`/`unknown` và hoàn toàn do phía client đặt,
 * nên phải kiểm tra shape trước khi dùng — không `as` bừa, vì state rác (từ
 * lần điều hướng khác) sẽ làm trang crash khi đọc field không tồn tại.
 */
export function isSubmitSuccessState(value: unknown): value is SubmitSuccessState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<SubmitSuccessState>;
  return (
    typeof candidate.teamName === 'string' &&
    typeof candidate.assignmentName === 'string' &&
    typeof candidate.resubmitted === 'boolean' &&
    Array.isArray(candidate.fileNames) &&
    candidate.fileNames.every((fileName) => typeof fileName === 'string')
  );
}
