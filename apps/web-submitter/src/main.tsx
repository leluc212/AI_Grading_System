/**
 * Bootstrap của app `web-submitter`.
 *
 * Thứ tự khởi động:
 *   1. Nạp CSS global của Cloudscape Design System (bắt buộc, nếu thiếu thì
 *      component Cloudscape mất toàn bộ token màu/typography).
 *   2. Đọc biến môi trường `VITE_API_BASE_URL`:
 *      - Nếu có giá trị (không rỗng): cấu hình `setApiBaseUrl(apiBaseUrl)` và
 *        KHÔNG khởi động MSW (gọi trực tiếp tới backend thật). Nếu URL không
 *        hợp lệ, hiển thị thông báo lỗi cấu hình thay vì màn hình trắng.
 *      - Nếu để trống: (CHỈ Ở DEV) khởi động MSW qua `startMockServer()` và `await`
 *        cho tới khi worker sẵn sàng, TRƯỚC khi render React.
 *   3. Render React root trong `<StrictMode>` + `<BrowserRouter>`.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@cloudscape-design/global-styles/index.css';
import './gpu-acceleration.css';
import { ThemeProvider } from './theme/ThemeContext';
import { App } from './App';
import { setApiBaseUrl } from './services';

/**
 * Hiển thị lỗi khởi động (mock server hoặc cấu hình URL) ngay trên trang.
 */
function renderStartupError(
  container: HTMLElement,
  title: string,
  description: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.setAttribute('role', 'alert');
  panel.style.cssText =
    'max-width:720px;margin:48px auto;padding:24px;border:1px solid #d13212;' +
    'border-radius:8px;font-family:system-ui,sans-serif;line-height:1.6;color:#16191f';
  panel.innerHTML = `
    <h1 style="margin:0 0 12px;font-size:20px"></h1>
    <p style="margin:0 0 12px"></p>
    <p style="margin:0 0 12px"><strong>Lỗi:</strong> <code></code></p>
  `;
  const h1 = panel.querySelector('h1');
  if (h1 !== null) {
    h1.textContent = title;
  }
  const p = panel.querySelector('p');
  if (p !== null) {
    p.textContent = description;
  }
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

const DEFAULT_API_BASE_URL = 'https://jb9dbtvu30.execute-api.ap-southeast-1.amazonaws.com';

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (container === null) {
    throw new Error('Không tìm thấy phần tử #root trong index.html.');
  }

  const apiBaseUrl = (
    import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? DEFAULT_API_BASE_URL : '')
  )?.trim();
  if (apiBaseUrl) {
    try {
      setApiBaseUrl(apiBaseUrl);
    } catch (error) {
      console.error('[web-submitter] Cấu hình VITE_API_BASE_URL không hợp lệ:', error);
      renderStartupError(
        container,
        'Cấu hình API không hợp lệ',
        'Biến môi trường VITE_API_BASE_URL không đúng định dạng URL (yêu cầu https:// hoặc http://localhost / http://127.0.0.1).',
        error,
      );
      return;
    }
  } else {
    try {
      await startMockServerInDev();
    } catch (error) {
      console.error('[web-submitter] Không khởi động được mock server (MSW):', error);
      renderStartupError(
        container,
        'Không khởi động được mock server (MSW)',
        'Giai đoạn 1 chạy toàn bộ dữ liệu qua mock server trong trình duyệt. Không có nó thì mọi lời gọi API sẽ thất bại, nên trang dừng ở đây thay vì hiển thị giao diện hỏng.',
        error,
      );
      return;
    }
  }

  createRoot(container).render(
    <StrictMode>
      <ThemeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </StrictMode>,
  );
}

await bootstrap();
