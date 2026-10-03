/**
 * Cấu hình Vite + Vitest cho `web-submitter` (task 5.1 / 5.7).
 *
 * Dùng `defineConfig` của `vitest/config` (thay vì của `vite`) để CẢ build và
 * test đọc chung 1 file — nhờ đó plugin React (JSX transform) cũng áp dụng
 * cho test. Nếu tách riêng `vitest.config.ts`, Vitest sẽ bỏ qua
 * `vite.config.ts` và mất plugin React -> JSX trong test không compile.
 *
 * Ghi chú về workspace package (`@quick-grading/api-client`,
 * `@quick-grading/mock-server`, `@quick-grading/shared-types`): các package
 * này expose trực tiếp TypeScript source (`main: ./src/index.ts`) và được npm
 * workspaces symlink vào `node_modules`. Vite resolve symlink về đường dẫn
 * thật (nằm trong repo) nên coi chúng là source và tự transpile — không cần
 * build bước trung gian, và cũng không bị `optimizeDeps` pre-bundle.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    // Component test cần DOM -> jsdom. (Khác với `api-client` dùng env
    // 'node' vì ở đó chỉ test service layer qua `fetch`.)
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./test/setup.ts'],
    css: false,
  },
});
