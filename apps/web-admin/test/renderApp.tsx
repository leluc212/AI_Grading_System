/**
 * Helper render `App` của `web-admin` tại 1 URL cho trước.
 *
 * Luôn render qua `App` (không render page lẻ) để test đi đúng đường thật:
 * `AdminAuthProvider` -> bảng route -> `RequireAdminAuth` -> `AdminLayout` ->
 * page. Route guard chỉ có nghĩa khi được kiểm trong đúng ngữ cảnh này.
 */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App';

export function renderAppAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

/**
 * Giả lập "đã đăng nhập sẵn" bằng cách ghi trực tiếp session vào
 * `localStorage` — đúng nơi và đúng shape mà `authApi` dùng.
 *
 * Dùng cách này (thay vì gọi `authApi.login`) cho các test KHÔNG kiểm thử
 * luồng đăng nhập: nó không cần mock network, và phản ánh đúng kịch bản thật
 * "Admin F5 lại trang khi đang có phiên".
 *
 * Phải khớp `ADMIN_SESSION_KEY` và shape `{ token, username }` trong
 * `packages/api-client/src/authApi.ts`.
 */
export function seedAdminSession(username = 'admin'): void {
  localStorage.setItem(
    'quick-grading-admin-session',
    JSON.stringify({ token: 'mock-admin-token.test', username }),
  );
}
