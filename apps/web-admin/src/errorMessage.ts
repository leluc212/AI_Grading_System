/**
 * Chuyển 1 lỗi bắt được từ lớp service thành câu thông báo hiển thị cho Admin.
 *
 * Quy tắc giống `web-submitter`: chỉ tin `message` của `DomainError` (đó là
 * câu tiếng Việt do hệ thống soạn, đã map từ body `{ code, message }` của
 * server ở `api-client/http.ts`); mọi lỗi khác trả về `fallback` do caller
 * quyết định, còn chi tiết kỹ thuật thì log ra console.
 *
 * Lưu ý: Admin là người vận hành nên câu fallback ở đây có thể nói rõ hơn về
 * mặt kỹ thuật so với phía Submitter, nhưng vẫn không nên dội nguyên
 * `Failed to fetch` ra UI.
 */
import { DomainError } from '@quick-grading/shared-types';

export function toDisplayMessage(error: unknown, fallback: string): string {
  if (error instanceof DomainError && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}
