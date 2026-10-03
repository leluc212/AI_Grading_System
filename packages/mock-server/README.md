# @quick-grading/mock-server

MSW (Mock Service Worker) request handlers + mock data store cho **Giai đoạn 1**
(UI local, chưa có backend AWS thật). Xem `design.md` > "Mock Server Design"
để biết kiến trúc đầy đủ.

## Cách dùng trong app (web-submitter / web-admin)

```ts
import { startMockServer } from '@quick-grading/mock-server';

// Gọi 1 lần trước khi render React root, ví dụ trong main.tsx
await startMockServer();
```

## Bước bắt buộc: sinh `mockServiceWorker.js`

MSW ở trình duyệt hoạt động bằng cách đăng ký 1 Service Worker thật
(`mockServiceWorker.js`) trong thư mục `public/` của app. File này **phải**
được sinh ra bằng CLI của MSW, không thể import qua code:

```sh
npx msw init <path-to-app>/public --save
```

Cần chạy lệnh này **một lần cho mỗi app** (`apps/web-submitter/public` và
`apps/web-admin/public`) ngay sau khi app đó được scaffold thành Vite app
(task 5.1 và 6.1) — tại thời điểm task 3.1, hai app này chưa có thư mục
`public/` nên bước này chưa thực hiện được và sẽ do task 5.1/6.1 đảm nhiệm.

Nếu quên bước này, `worker.start()` sẽ reject với lỗi không tìm thấy
`mockServiceWorker.js` khi chạy trên trình duyệt.

## Cấu trúc

```
src/
  handlers/
    index.ts     # gộp toàn bộ request handler theo domain (task 3.3 - 3.11)
  browser.ts      # setupWorker() cho môi trường trình duyệt
  index.ts        # entry point, export startMockServer()
```
