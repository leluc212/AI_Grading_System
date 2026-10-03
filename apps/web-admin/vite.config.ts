/**
 * Cấu hình Vite + Vitest cho `web-admin` (task 6.1).
 *
 * Giống `web-submitter`: dùng `defineConfig` của `vitest/config` để CẢ build
 * và test đọc chung 1 file, nhờ đó plugin React (JSX transform) cũng áp dụng
 * cho test. Nếu tách riêng `vitest.config.ts`, Vitest sẽ bỏ qua
 * `vite.config.ts` và JSX trong test không compile.
 *
 * Port 5174 (khác 5173 của `web-submitter`) để chạy song song 2 app khi demo
 * luồng end-to-end: nộp bài ở app này, xem/chấm ở app kia.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./test/setup.ts'],
    css: false,
    /**
     * Cao hơn mặc định 5s vì 2 nhóm test ở đây vốn chậm một cách chính đáng:
     * test dựng rồi đọc lại file `.xlsx` thật bằng `exceljs`, và test poll
     * lượt chấm bằng fake timers. Đặt ở config (thay vì truyền `--testTimeout`
     * ở dòng lệnh) để `npm test` chạy đúng mà không cần nhớ thêm cờ.
     */
    testTimeout: 20000,
  },
});
