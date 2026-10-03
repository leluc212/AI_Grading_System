/**
 * Test trang đăng nhập Admin (task 6.2).
 *
 * Bao gồm cả hành vi quay lại URL đã bị guard chặn sau khi đăng nhập — đó là
 * phần dễ hỏng nhất của cặp "guard + trang đăng nhập" và không thể kiểm bằng
 * cách render trang đăng nhập đơn lẻ.
 *
 * _Requirements: 4.1, 4.4_
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UnauthorizedError } from '@quick-grading/shared-types';
import { assignmentsApi, authApi } from '../src/services';
import { renderAppAt } from './renderApp';

vi.mock('../src/services', async () => (await import('./servicesMock')).createServicesMock());

const login = vi.mocked(authApi.login);
const getCurrentAdmin = vi.mocked(authApi.getCurrentAdmin);

/**
 * Giả lập đăng nhập thành công: `authApi.login` ghi session rồi
 * `getCurrentAdmin` đọc lại — ở đây mô phỏng đúng thứ tự đó bằng cách cho
 * `getCurrentAdmin` trả admin kể từ sau khi `login` được gọi.
 */
function mockSuccessfulLogin(username = 'admin'): void {
  login.mockImplementation(async () => {
    getCurrentAdmin.mockReturnValue({ username });
    return { token: 'mock-admin-token.test' };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentAdmin.mockReturnValue(null);
  // Sau khi đăng nhập thành công, test rơi vào trang danh sách đợt chấm — nó
  // gọi API ngay khi mount.
  vi.mocked(assignmentsApi.listAssignments).mockResolvedValue([]);
});

describe('LoginPage - hiển thị', () => {
  it('có ô tên đăng nhập và mật khẩu, mật khẩu bị che', () => {
    renderAppAt('/login');

    expect(screen.getByLabelText('Tên đăng nhập')).toBeDefined();
    const password = screen.getByLabelText('Mật khẩu');
    expect(password.getAttribute('type')).toBe('password');
  });

  it('không in thông tin tài khoản test lên UI', () => {
    renderAppAt('/login');

    // Credential của mock server chỉ nằm trong README/handler, không phải UI.
    expect(screen.queryByText(/admin123/)).toBeNull();
  });
});

describe('LoginPage - validate tại client', () => {
  it('không gọi API khi để trống cả 2 ô', async () => {
    const user = userEvent.setup();
    renderAppAt('/login');

    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(login).not.toHaveBeenCalled();
    expect(screen.getByText('Tên đăng nhập không được để trống.')).toBeDefined();
    expect(screen.getByText('Mật khẩu không được để trống.')).toBeDefined();
  });

  it('không gọi API khi thiếu mật khẩu', async () => {
    const user = userEvent.setup();
    renderAppAt('/login');

    await user.type(screen.getByLabelText('Tên đăng nhập'), 'admin');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(login).not.toHaveBeenCalled();
    expect(screen.getByText('Mật khẩu không được để trống.')).toBeDefined();
  });
});

describe('LoginPage - đăng nhập thành công', () => {
  it('gọi lớp service với thông tin đã cắt khoảng trắng và vào khu vực Admin', async () => {
    const user = userEvent.setup();
    mockSuccessfulLogin();
    renderAppAt('/login');

    await user.type(screen.getByLabelText('Tên đăng nhập'), '  admin  ');
    await user.type(screen.getByLabelText('Mật khẩu'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('admin', 'admin123');
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Đợt chấm' })).toBeDefined();
  });

  it('quay lại đúng URL đã bị guard chặn trước đó', async () => {
    const user = userEvent.setup();
    mockSuccessfulLogin();

    // Vào thẳng /rubric khi chưa đăng nhập -> guard đẩy sang /login kèm state.
    renderAppAt('/rubric');
    expect(screen.getByLabelText('Tên đăng nhập')).toBeDefined();

    await user.type(screen.getByLabelText('Tên đăng nhập'), 'admin');
    await user.type(screen.getByLabelText('Mật khẩu'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Cấu hình rubric' })).toBeDefined();
  });
});

describe('LoginPage - đăng nhập thất bại (Requirement 4.4)', () => {
  it('hiện thông báo sai tài khoản/mật khẩu và KHÔNG vào khu vực Admin', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    login.mockRejectedValue(new UnauthorizedError());

    renderAppAt('/login');
    await user.type(screen.getByLabelText('Tên đăng nhập'), 'admin');
    await user.type(screen.getByLabelText('Mật khẩu'), 'sai-mat-khau');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(await screen.findByText('Tài khoản hoặc mật khẩu không đúng.')).toBeDefined();
    expect(screen.queryByRole('heading', { level: 1, name: 'Đợt chấm' })).toBeNull();
    expect(screen.getByLabelText('Tên đăng nhập')).toBeDefined();
  });

  it('xoá mật khẩu nhưng giữ lại tên đăng nhập sau khi thất bại', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    login.mockRejectedValue(new UnauthorizedError());

    renderAppAt('/login');
    await user.type(screen.getByLabelText('Tên đăng nhập'), 'admin');
    await user.type(screen.getByLabelText('Mật khẩu'), 'sai-mat-khau');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    await screen.findByText('Tài khoản hoặc mật khẩu không đúng.');

    expect((screen.getByLabelText('Tên đăng nhập') as HTMLInputElement).value).toBe('admin');
    expect((screen.getByLabelText('Mật khẩu') as HTMLInputElement).value).toBe('');
  });

  it('lỗi mạng hiện câu fallback, không lộ chi tiết kỹ thuật', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    login.mockRejectedValue(new TypeError('Failed to fetch'));

    renderAppAt('/login');
    await user.type(screen.getByLabelText('Tên đăng nhập'), 'admin');
    await user.type(screen.getByLabelText('Mật khẩu'), 'admin123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));

    expect(
      await screen.findByText('Không đăng nhập được do lỗi hệ thống. Vui lòng thử lại.'),
    ).toBeDefined();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });
});
