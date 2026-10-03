/**
 * Helper render `App` tại 1 URL cho trước.
 *
 * Dùng `MemoryRouter` (thay cho `BrowserRouter` ở `main.tsx`) để chỉ định URL
 * khởi đầu ngay trong test, không phụ thuộc `window.history`.
 *
 * Luôn render qua `App` (không render page lẻ) để test đi đúng đường thật:
 * bảng route -> page -> lớp service. Nhờ vậy test bắt được cả lỗi khai báo
 * route sai, không chỉ lỗi bên trong page.
 */
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App';

/**
 * @param path URL khởi đầu.
 * @param state Giá trị cho `location.state` — cần cho trang
 *   `/submit-success`, vốn chỉ hiển thị khi có state do form đặt vào.
 */
export function renderAppAt(path: string, state?: unknown) {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <App />
    </MemoryRouter>,
  );
}
