/**
 * Bootstrap của app `web-admin` (task 6.1).
 *
 * Thứ tự khởi động giống `web-submitter`:
 *   1. Nạp CSS global của Cloudscape (thiếu là mất toàn bộ token màu/typography).
 *   2. (CHỈ Ở DEV) `await startMockServer()` TRƯỚC khi render React — nếu
 *      render trước, request `fetch` đầu tiên của UI có thể lọt ra network
 *      thật vì worker chưa kịp đăng ký.
 *   3. Render React root trong `<StrictMode>` + `<BrowserRouter>`.
 *
 * Import ĐỘNG `@quick-grading/mock-server` sau cờ `import.meta.env.DEV` để
 * bundle production không chứa `msw`; sang giai đoạn 2 chỉ cần xoá hàm
 * `startMockServerInDev()` là bỏ sạch mock (design.md > Migration Notes).
 *
 * MSW ở trình duyệt cần `public/mockServiceWorker.js` (đã sinh bằng
 * `npx msw init public --save`).
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@cloudscape-design/global-styles/index.css';
import { App } from './App';

/**
 * Hiển thị lỗi khởi động mock server ngay trên trang.
 *
 * Trước đây chỗ này chỉ `console.error` rồi render app như thường. Hệ quả: khi
 * MSW không khởi động được, app vẫn hiện bình thường nhưng MỌI lời gọi API đi
 * thẳng ra Vite và nhận 404 — người dùng chỉ thấy thông báo "lỗi hệ thống" mơ
 * hồ ở từng trang, không có cách nào đoán được nguyên nhân thật. Giai đoạn 1
 * mà không có mock server thì app không dùng được, nên phải báo thẳng thay vì
 * hỏng âm thầm.
 */
function renderMockServerError(container: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  panel.style.cssText =
    'max-width:720px;margin:48px auto;padding:24px;border:1px solid #d13212;' +
    'border-radius:8px;font-family:system-ui,sans-serif;line-height:1.6;color:#16191f';
  panel.innerHTML = `
    <h1 style="margin:0 0 12px;font-size:20px">Không khởi động được mock server (MSW)</h1>
    <p style="margin:0 0 12px">
      Giai đoạn 1 chạy toàn bộ dữ liệu qua mock server trong trình duyệt. Không có nó thì
      mọi lời gọi API sẽ thất bại, nên trang dừng ở đây thay vì hiển thị giao diện hỏng.
    </p>
    <p style="margin:0 0 12px"><strong>Lỗi:</strong> <code></code></p>
    <p style="margin:0">Thử theo thứ tự: tải lại trang bằng Ctrl+Shift+R; mở DevTools &gt;
      Application &gt; Service workers rồi bấm Unregister và tải lại; nếu vẫn lỗi thì chạy
      <code>npx msw init public --save</code> trong <code>apps/web-admin</code>.</p>
  `;
  // Gán qua `textContent` để nội dung lỗi không bị hiểu thành HTML.
  const code = panel.querySelector('code');
  if (code !== null) {
    code.textContent = message;
  }
  container.appendChild(panel);
}

async function startMockServerInDev(): Promise<void> {
  if (!import.meta.env.DEV) {
    return;
  }
  const { startMockServer } = await import('@quick-grading/mock-server');
  await startMockServer();
}

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (container === null) {
    throw new Error('Không tìm thấy phần tử #root trong index.html.');
  }

  try {
    await startMockServerInDev();
  } catch (error) {
    console.error('[web-admin] Không khởi động được mock server (MSW):', error);
    renderMockServerError(container, error);
    return;
  }

  createRoot(container).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void bootstrap();
