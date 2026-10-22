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
import './gpu-acceleration.css';
import { App } from './App';
import { setApiBaseUrl, setCognitoConfig } from './services';

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
const DEFAULT_COGNITO_CLIENT_ID = '2ck2l1fmjmd61a94d1g8i0pi51';
const DEFAULT_COGNITO_REGION = 'ap-southeast-1';

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (container === null) {
    throw new Error('Không tìm thấy phần tử #root trong index.html.');
  }

  const apiBaseUrl = (
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.PROD ? DEFAULT_API_BASE_URL : '')
  )?.trim();
  const cognitoClientId = (
    import.meta.env.VITE_COGNITO_CLIENT_ID ||
    (import.meta.env.PROD ? DEFAULT_COGNITO_CLIENT_ID : '')
  )?.trim();
  const cognitoRegion = (
    import.meta.env.VITE_COGNITO_REGION ||
    (import.meta.env.PROD ? DEFAULT_COGNITO_REGION : 'ap-southeast-1')
  )?.trim();

  if (apiBaseUrl) {
    try {
      setApiBaseUrl(apiBaseUrl);
    } catch (error) {
      console.error('[web-admin] Cấu hình VITE_API_BASE_URL không hợp lệ:', error);
      renderStartupError(
        container,
        'Cấu hình API không hợp lệ',
        'Biến môi trường VITE_API_BASE_URL không đúng định dạng URL (yêu cầu https:// hoặc http://localhost / http://127.0.0.1).',
        error,
      );
      return;
    }

    if (cognitoClientId) {
      setCognitoConfig({
        userPoolClientId: cognitoClientId,
        region: cognitoRegion,
      });
    }
  } else {
    try {
      await startMockServerInDev();
    } catch (error) {
      console.error('[web-admin] Không khởi động được mock server (MSW):', error);
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
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
}

void bootstrap();
