/**
 * Entry point của `@quick-grading/mock-server`.
 *
 * `apps/web-submitter` và `apps/web-admin` chỉ cần import `startMockServer`
 * và gọi nó (ví dụ ở `main.tsx`, trước khi render React root) để bắt đầu
 * chặn request qua MSW ở giai đoạn 1. Xem design.md > Mock Server Design.
 *
 * LƯU Ý QUAN TRỌNG (lazy worker import): barrel này CỐ TÌNH không
 * import/re-export `worker` từ `./browser.js` ở top level. `browser.ts` gọi
 * `setupWorker(...handlers)` ngay khi module được evaluate, mà `setupWorker`
 * (`msw/browser`) THROW `Invariant Violation` trong môi trường non-browser
 * (Node/Vitest). Vì vậy nếu re-export tĩnh, việc chỉ cần `import { handlers }`
 * (hay `resetMockDb`/`getDb`) từ package này trong unit test service layer
 * (task 4.3) cũng kéo theo evaluate `browser.ts` và làm crash cả test suite.
 *
 * Giải pháp: chỉ `startMockServer()` (chạy ở trình duyệt) mới `await import(
 * './browser.js')` ĐỘNG, nên `browser.ts` chỉ được evaluate khi thực sự
 * khởi động worker ở trình duyệt — không bao giờ chạy khi import barrel ở
 * Node. Nhờ đó package an toàn để import trong Node/Vitest cho test service
 * layer. Nếu consumer nào cần `worker` trực tiếp, import sâu từ
 * `@quick-grading/mock-server/dist/browser.js` thay vì re-export tĩnh ở đây.
 */
export { handlers } from './handlers/index.js';
// Re-export store helpers để test (task 4.3) có thể reset về seed data sạch
// giữa các test-case, và (nếu cần) đọc trực tiếp store để assert trạng thái.
export { resetMockDb, getDb } from './db.js';
export type { MockDb } from './db.js';

export interface StartMockServerOptions {
  /**
   * Hành vi khi gặp request không khớp handler nào.
   *
   * Dùng `'bypass'` (mặc định) để cho phép rollout handler dần dần: request
   * chưa có handler tương ứng sẽ đi thẳng ra network thật thay vì làm crash
   * app hoặc log warning ồn ào trong giai đoạn đang xây dựng handler
   * (task 3.3 - 3.11). Có thể đổi sang `'warn'` khi muốn phát hiện sớm
   * request bị thiếu handler.
   */
  onUnhandledRequest?: 'bypass' | 'warn' | 'error';
}

/**
 * Khởi động MSW worker ở trình duyệt.
 *
 * `worker` được import ĐỘNG tại đây (không phải top-level) để `browser.ts`
 * chỉ evaluate khi hàm này thực sự được gọi ở trình duyệt — xem lý do ở
 * JSDoc đầu file (giữ package an toàn khi import ở Node/Vitest).
 *
 * @returns Promise resolve khi worker đã sẵn sàng chặn request.
 */
export async function startMockServer(options: StartMockServerOptions = {}): Promise<void> {
  const { onUnhandledRequest = 'bypass' } = options;
  const { worker } = await import('./browser.js');
  await worker.start({ onUnhandledRequest });
}
