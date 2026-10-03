/**
 * MSW browser worker setup.
 *
 * Đây chỉ là phần khai báo `SetupWorker`; việc `start()`/`stop()` thực tế do
 * `startMockServer()` ở `index.ts` đảm nhiệm để apps (web-submitter,
 * web-admin) chỉ cần import 1 hàm duy nhất, không cần biết chi tiết MSW.
 *
 * Lưu ý: mỗi app (Vite) tiêu thụ package này cần chạy
 * `npx msw init <public-dir> --save` MỘT LẦN để sinh file
 * `mockServiceWorker.js` trong thư mục `public/` của app đó — service worker
 * này là bắt buộc để MSW chặn request ở trình duyệt. Xem README.md trong
 * package này để biết chi tiết; bước này chưa thực hiện ở task 3.1 vì
 * `apps/web-submitter` và `apps/web-admin` chưa được scaffold thành Vite app
 * (sẽ làm ở task 5.1 / 6.1).
 *
 * See design.md > Mock Server Design (Giai đoạn 1).
 */
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers/index.js';

export const worker = setupWorker(...handlers);
