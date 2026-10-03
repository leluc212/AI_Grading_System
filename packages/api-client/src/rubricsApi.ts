/**
 * Service layer cho domain Rubric (`rubricsApi`).
 *
 * Signature các hàm bám sát design.md > API Contract (Service Layer). Mỗi
 * hàm gọi `fetch` tới đúng endpoint mà mock handler
 * (`packages/mock-server/src/handlers/rubrics.ts`) đăng ký intercept; lỗi
 * HTTP được `http.ts` map sẵn sang typed error class nên caller chỉ cần
 * `try/catch` theo `instanceof`.
 *
 * Ánh xạ hàm -> endpoint (verified theo handler thật trong
 * `packages/mock-server/src/handlers/rubrics.ts`):
 *   - getActiveRubric()        -> GET  /api/rubrics/active
 *   - listRubricVersions()     -> GET  /api/rubrics
 *   - saveRubric(input)        -> POST /api/rubrics
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import type { Rubric, RubricCriterion } from '@quick-grading/shared-types';
import { apiFetch, apiFetchJson } from './http.js';

export const rubricsApi = {
  /**
   * Lấy rubric đang active (dùng cho lượt chấm mới — Requirement 9.4).
   *
   * Handler trả JSON `null` (kèm HTTP 200) khi chưa có rubric nào active —
   * KHÔNG 404. `apiFetch` parse & trả về đúng body đó, nên `null` là giá
   * trị hợp lệ (phân biệt "chưa cấu hình rubric" với lỗi hệ thống). Return
   * type `Rubric | null` bám sát design contract.
   */
  getActiveRubric(): Promise<Rubric | null> {
    return apiFetch<Rubric | null>('/api/rubrics/active');
  },

  /**
   * Liệt kê toàn bộ phiên bản rubric (không xoá bản cũ — Requirement 9.2).
   * Handler đã sort tăng dần theo `version` nên UI không cần sort lại.
   */
  listRubricVersions(): Promise<Rubric[]> {
    return apiFetch<Rubric[]>('/api/rubrics');
  },

  /**
   * Lưu 1 phiên bản rubric mới (Requirement 9.1, 9.2, 9.4).
   *
   * POST body JSON `{ criteria }`; handler tự tăng `version`, set bản mới
   * thành active và deactivate các bản cũ (vẫn giữ lại để tra lịch sử). Trả
   * HTTP 201 kèm `Rubric` vừa tạo. Ném `ValidationError` nếu `criteria`
   * rỗng/không hợp lệ.
   */
  saveRubric(input: { criteria: RubricCriterion[] }): Promise<Rubric> {
    return apiFetchJson<Rubric>('/api/rubrics', 'POST', input);
  },
};
