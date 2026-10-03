/**
 * Chuyển 1 lỗi bắt được từ lớp service thành câu thông báo hiển thị cho
 * Submitter.
 *
 * Quy tắc: CHỈ tin `message` của `DomainError` (`ValidationError`,
 * `TeamNameConflictError`, `AssignmentClosedError`, `NotFoundError`, ...) —
 * đó là những câu tiếng Việt do chính hệ thống soạn, đã map từ body
 * `{ code, message }` của server ở `api-client/http.ts`, nên hiển thị
 * nguyên văn là đúng và nhất quán giữa mock (giai đoạn 1) và API thật (giai
 * đoạn 2).
 *
 * Mọi lỗi khác (`TypeError: Failed to fetch`, lỗi parse, lỗi runtime...) đều
 * trả về `fallback` do caller quyết định. Lý do: thông báo kỹ thuật tiếng
 * Anh vô nghĩa với sinh viên, và nội dung lỗi thô có thể lộ chi tiết nội bộ.
 * Phần chi tiết để debug được log ra console bởi caller.
 */
import { DomainError } from '@quick-grading/shared-types';

export function toDisplayMessage(error: unknown, fallback: string): string {
  if (error instanceof DomainError && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}
