/**
 * Cấu hình Vitest cho unit test của service layer (`api-client`) — task 4.3.
 *
 * - environment: 'node' — dùng `fetch`/`FormData`/`File`/`Blob` native của
 *   Node 20 (undici) để MSW (`msw/node`) intercept đáng tin cậy nhất; những
 *   thứ jsdom cung cấp (localStorage) được polyfill nhẹ trong `test/setup.ts`
 *   thay vì kéo cả jsdom (tránh khác biệt giữa File/FormData của jsdom và
 *   undici khi gửi qua `fetch`).
 * - env.QG_API_BASE_URL — `fetch` của Node yêu cầu URL tuyệt đối và không
 *   resolve path tương đối; đặt base URL tuyệt đối để mọi request api-client
 *   trỏ tới `http://localhost/api/...`, MSW match theo pathname. Không đụng
 *   default '' của bản build trình duyệt (xem `http.ts > readApiBaseUrl`).
 * - setupFiles — vòng đời MSW server + reset localStorage/db giữa các test.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./test/setup.ts'],
    env: {
      QG_API_BASE_URL: 'http://localhost',
    },
  },
});
