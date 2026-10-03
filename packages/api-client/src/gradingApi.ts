/**
 * Service layer cho domain Grading (`gradingApi`).
 *
 * Signature các hàm bám sát design.md > API Contract (Service Layer). Mỗi
 * hàm gọi `fetch` tới đúng endpoint mà mock handler
 * (`packages/mock-server/src/handlers/grading.ts`) đăng ký intercept; lỗi
 * HTTP được `http.ts` map sẵn sang typed error class nên caller chỉ cần
 * `try/catch` theo `instanceof`.
 *
 * Ánh xạ hàm -> endpoint (verified theo handler thật trong
 * `packages/mock-server/src/handlers/grading.ts`):
 *   - triggerGrading(teamId, adminId)             -> POST  /api/teams/:teamId/grading
 *   - listGradingHistory(teamId)                  -> GET   /api/teams/:teamId/grading/history
 *   - getLatestGrading(teamId)                    -> (suy ra từ listGradingHistory — KHÔNG có endpoint riêng)
 *   - submitReview(teamId, attemptId, input)      -> PATCH /api/teams/:teamId/grading/:gradingAttemptId/review
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import type { GradingResult } from '@quick-grading/shared-types';
import { apiFetch, apiFetchJson } from './http.js';

export const gradingApi = {
  /**
   * Kích hoạt 1 lượt chấm bài cho 1 Team (hành động Admin-only).
   *
   * Handler thật nhận body JSON `{ adminId }` và trả HTTP **202 Accepted**
   * kèm `GradingResult` ở trạng thái `IN_PROGRESS` — việc chấm bài hoàn tất
   * bất đồng bộ (out-of-band), UI phải tự poll `listGradingHistory` /
   * `getLatestGrading` để thấy kết quả cuối (`GRADED`/`FAILED`). `apiFetch`
   * coi mọi status 2xx là thành công nên 202 được parse & trả về bình
   * thường (202 = "đã tiếp nhận, đang xử lý").
   *
   * Ném `GradingInProgressError` nếu nhóm đã có 1 lượt chấm `IN_PROGRESS`
   * (đã được map sẵn ở `http.ts`); `NotFoundError`/`ValidationError` nếu
   * team không tồn tại hoặc chưa nộp đủ 2 file.
   */
  triggerGrading(teamId: string, adminId: string): Promise<GradingResult> {
    return apiFetchJson<GradingResult>(`/api/teams/${encodeURIComponent(teamId)}/grading`, 'POST', {
      adminId,
    });
  },

  /**
   * Lấy TOÀN BỘ lịch sử chấm của 1 Team (không xoá/ghi đè — Property 4 ở
   * design.md). Mảng trả về theo thứ tự chèn (chronological): phần tử cuối
   * là lượt chấm gần nhất. Ném `NotFoundError` nếu team không tồn tại.
   */
  listGradingHistory(teamId: string): Promise<GradingResult[]> {
    return apiFetch<GradingResult[]>(`/api/teams/${encodeURIComponent(teamId)}/grading/history`);
  },

  /**
   * Lấy lượt chấm GẦN NHẤT của 1 Team, hoặc `null` nếu chưa từng chấm.
   *
   * KHÔNG có endpoint riêng ở mock server (xem JSDoc `grading.ts`): service
   * layer suy ra bằng cách lấy phần tử cuối của `listGradingHistory` (mảng
   * đã theo thứ tự chronological). Gọi qua `gradingApi.listGradingHistory`
   * (property access trực tiếp trên object đã export) để không phụ thuộc
   * vào việc `this` có được bind hay không khi method bị destructure.
   */
  async getLatestGrading(teamId: string): Promise<GradingResult | null> {
    const history = await gradingApi.listGradingHistory(teamId);
    return history.length > 0 ? history[history.length - 1] : null;
  },

  /**
   * Gửi kết quả review của Admin cho 1 lượt chấm (Requirement 7.3-7.5).
   *
   * PATCH với body JSON `input` gồm `reviewedBy` (bắt buộc) và `finalScore`
   * (tuỳ chọn — chỉ gửi khi Admin sửa điểm; không gửi = giữ nguyên điểm AI).
   * `score` gốc của AI không bao giờ bị chạm tới. Ném `NotFoundError` nếu
   * team/lượt chấm không tồn tại, `ValidationError` nếu thiếu `reviewedBy`
   * hoặc `finalScore` sai kiểu.
   */
  submitReview(
    teamId: string,
    gradingAttemptId: string,
    input: { finalScore?: number; reviewedBy: string },
  ): Promise<GradingResult> {
    return apiFetchJson<GradingResult>(
      `/api/teams/${encodeURIComponent(teamId)}/grading/${encodeURIComponent(
        gradingAttemptId,
      )}/review`,
      'PATCH',
      input,
    );
  },
};
