/**
 * Service layer cho domain Export (`exportApi`).
 *
 * design.md > API Contract khai báo hàm FINAL là
 * `exportAssignmentToExcel(assignmentId): Promise<Blob>`. Tuy nhiên việc
 * build workbook `.xlsx` thật diễn ra Ở PHÍA CLIENT (web-admin) và thuộc
 * task 11 — KHÔNG làm ở đây. Tầng service này chỉ chịu trách nhiệm LẤY DỮ
 * LIỆU NGUỒN cần để xuất (JSON), khớp đúng thứ mock handler
 * (`packages/mock-server/src/handlers/export.ts`) trả về.
 *
 * Vì vậy hàm expose ở đây là `getAssignmentExportData(assignmentId)`; task
 * 11 (web-admin) sẽ viết wrapper `exportAssignmentToExcel` tiêu thụ dữ liệu
 * này rồi dựng `Blob` `.xlsx` ở client.
 *
 * Ánh xạ hàm -> endpoint (verified theo handler thật):
 *   - getAssignmentExportData(assignmentId) -> GET /api/assignments/:assignmentId/export-data
 *
 * Lưu ý về type: các interface dữ liệu export hiện được định nghĩa CỤC BỘ
 * trong mock handler (chưa export từ `shared-types`). Để api-client KHÔNG
 * phụ thuộc ngược vào `mock-server`, ta khai báo lại các interface tương
 * đương ngay tại file này (mirror đúng shape handler trả về). Nếu sau này
 * các type này được nâng lên `shared-types`, chỉ cần đổi import ở đây.
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import type { ReviewStatus } from '@quick-grading/shared-types';
import { apiFetch } from './http.js';

/** Literal khi nhóm chưa được chấm (mirror `NOT_GRADED_LABEL` ở export handler) */
export const NOT_GRADED_LABEL = 'CHƯA CHẤM' as const;

/** Thông tin thành viên tối thiểu cho export — Requirement 10.2 ("tên và MSSV") */
export interface ExportMember {
  memberName: string;
  studentCode?: string;
}

/** 1 dòng dữ liệu export ứng với 1 Team (mirror `ExportRow` ở export handler) */
export interface ExportRow {
  teamName: string;
  members: ExportMember[];
  /**
   * Requirement 7.6: ưu tiên `finalScore` nếu có, ngược lại `score`.
   * Requirement 10.3: `'CHƯA CHẤM'` nếu chưa có lượt chấm `GRADED` nào.
   */
  finalDisplayScore: number | typeof NOT_GRADED_LABEL;
  reviewStatus: ReviewStatus | null;
  /** ISO timestamp của lượt chấm gần nhất, `null` nếu nhóm chưa từng chấm */
  gradedAt: string | null;
}

/** Toàn bộ dữ liệu nguồn để xuất 1 Assignment (mirror `ExportDataResponse`) */
export interface AssignmentExportData {
  assignmentId: string;
  assignmentName: string;
  rows: ExportRow[];
}

export const exportApi = {
  /**
   * Lấy dữ liệu nguồn (JSON) cần để xuất báo cáo cho 1 Assignment.
   *
   * Trả về danh sách các nhóm kèm điểm hiển thị/trạng thái review/thời điểm
   * chấm. Ném `NotFoundError` nếu Assignment không tồn tại (đã map ở
   * `http.ts`). Việc dựng file `.xlsx` (`exportAssignmentToExcel`) là task
   * 11 ở web-admin, tiêu thụ dữ liệu từ hàm này.
   */
  getAssignmentExportData(assignmentId: string): Promise<AssignmentExportData> {
    return apiFetch<AssignmentExportData>(
      `/api/assignments/${encodeURIComponent(assignmentId)}/export-data`,
    );
  },
};
