/**
 * Service layer cho domain Assignment (`assignmentsApi`).
 *
 * Signature các hàm bám sát design.md > API Contract (Service Layer). Mỗi
 * hàm chỉ gọi `fetch` tới đúng endpoint mà mock handler
 * (`packages/mock-server/src/handlers/assignments.ts`) đăng ký intercept;
 * lỗi HTTP được `http.ts` map sẵn sang typed error class nên caller chỉ cần
 * `try/catch` theo `instanceof`.
 *
 * Ánh xạ hàm -> endpoint:
 *   - listAssignments()                     -> GET   /api/assignments
 *   - getAssignment(assignmentId)           -> GET   /api/assignments/:assignmentId
 *   - createAssignment(input)               -> POST  /api/assignments
 *   - setAssignmentStatus(assignmentId, s)  -> PATCH /api/assignments/:assignmentId/status
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import type { Assignment, AssignmentListItem, AssignmentStatus } from '@quick-grading/shared-types';
import { apiFetch, apiFetchJson } from './http.js';

export const assignmentsApi = {
  /**
   * Lấy danh sách toàn bộ Assignment, mỗi item kèm `submittedTeamCount`.
   *
   * Return type là `AssignmentListItem[]` (= `Assignment` + số nhóm đã nộp)
   * chứ không phải `Assignment[]`: endpoint vẫn luôn trả field đó, và
   * Requirement 1.3 yêu cầu dashboard Admin hiển thị số nhóm đã nộp — khai
   * báo đúng shape thật giúp UI dùng được mà không phải `as`. Vì
   * `AssignmentListItem extends Assignment`, mọi caller chỉ cần `Assignment[]`
   * (ví dụ `web-submitter` lọc theo `status`) không phải sửa gì.
   */
  listAssignments(): Promise<AssignmentListItem[]> {
    return apiFetch<AssignmentListItem[]>('/api/assignments');
  },

  /** Lấy chi tiết 1 Assignment theo id. Ném `NotFoundError` nếu không tồn tại. */
  getAssignment(assignmentId: string): Promise<Assignment> {
    return apiFetch<Assignment>(`/api/assignments/${encodeURIComponent(assignmentId)}`);
  },

  /**
   * Tạo Assignment mới. Ném `ValidationError` nếu `assignmentName` rỗng.
   * Mock trả HTTP 201 kèm Assignment vừa tạo (status mặc định `OPEN`).
   */
  createAssignment(input: { assignmentName: string }): Promise<Assignment> {
    return apiFetchJson<Assignment>('/api/assignments', 'POST', input);
  },

  /**
   * Đổi trạng thái Assignment (`OPEN` <-> `CLOSED`).
   * Ném `NotFoundError` nếu không tồn tại, `ValidationError` nếu status sai.
   */
  setAssignmentStatus(assignmentId: string, status: AssignmentStatus): Promise<Assignment> {
    return apiFetchJson<Assignment>(
      `/api/assignments/${encodeURIComponent(assignmentId)}/status`,
      'PATCH',
      { status },
    );
  },
};
