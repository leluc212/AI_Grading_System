/**
 * Assignment domain types.
 *
 * See design.md > Data Models for the source-of-truth shape of these types.
 */

export type AssignmentStatus = 'OPEN' | 'CLOSED';

export interface Assignment {
  /** UUID */
  assignmentId: string;
  assignmentName: string;
  status: AssignmentStatus;
  /** ISO8601 */
  createdAt: string;
  createdBy: string;
}

/**
 * Shape 1 phần tử của endpoint liệt kê Assignment (`GET /api/assignments`).
 *
 * Giàu hơn `Assignment` đúng 1 field: `submittedTeamCount`. Lý do tồn tại là
 * Requirement 1.3 — danh sách đợt chấm phải hiển thị số nhóm đã nộp, mà con
 * số này được tính từ bảng Team nên chỉ server biết; nếu để UI tự đếm thì
 * phải tải toàn bộ Team của mọi assignment.
 *
 * Đặt ở `shared-types` (thay vì khai báo riêng trong mock-server và
 * api-client) để chỉ có 1 định nghĩa duy nhất cho cả hai phía — đúng
 * Requirement 12.3: shape request/response ở giai đoạn 1 phải nhất quán với
 * mô hình dữ liệu dùng ở giai đoạn 2.
 */
export interface AssignmentListItem extends Assignment {
  /**
   * Số Team thuộc assignment này đã nộp bài ít nhất 1 lần, tức đang ở
   * `SUBMITTED` hoặc `RESUBMISSION_ALLOWED`. Team mới tạo mà chưa nộp
   * (`OPEN`) KHÔNG được tính.
   */
  submittedTeamCount: number;
}
