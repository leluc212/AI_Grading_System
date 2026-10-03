/**
 * Test khung giao diện Admin (task 6.1): điều hướng bên trái + đăng xuất.
 *
 * Điểm đáng kiểm nhất ở đây là điều hướng phải đi qua React Router chứ không
 * để trình duyệt tải lại trang, và đăng xuất phải đưa người dùng ra khỏi khu
 * vực Admin (nhờ route guard) chứ không chỉ xoá session âm thầm.
 *
 * _Requirements: 4.1_
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { assignmentsApi, authApi, rubricsApi } from '../src/services';
import { renderAppAt, seedAdminSession } from './renderApp';

vi.mock('../src/services', async () => (await import('./servicesMock')).createServicesMock());

const logout = vi.mocked(authApi.logout);
const getCurrentAdmin = vi.mocked(authApi.getCurrentAdmin);

beforeEach(() => {
  vi.clearAllMocks();
  seedAdminSession('admin');
  getCurrentAdmin.mockReturnValue({ username: 'admin' });
  logout.mockResolvedValue(undefined);
  // Trang bên trong layout gọi API khi mount; test này chỉ quan tâm layout.
  // Phải mock cả API của trang rubric vì test điều hướng sang `/rubric`.
  vi.mocked(assignmentsApi.listAssignments).mockResolvedValue([]);
  vi.mocked(rubricsApi.getActiveRubric).mockResolvedValue(null);
  vi.mocked(rubricsApi.listRubricVersions).mockResolvedValue([]);
});

describe('AdminLayout - điều hướng', () => {
  it('hiển thị menu điều hướng và tên người đang đăng nhập', () => {
    renderAppAt('/assignments');

    expect(screen.getByRole('link', { name: 'Đợt chấm' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Cấu hình rubric' })).toBeDefined();
    // `TopNavigation` render tên đăng nhập 2 lần (bản đầy đủ + bản thu gọn
    // cho màn hình hẹp), nên dùng `getAllByText` thay vì `getByText`.
    expect(screen.getAllByText('admin').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Tài khoản đang đăng nhập' })).toBeDefined();
  });

  it('bấm mục menu chuyển trang bằng router, không tải lại trang', async () => {
    const user = userEvent.setup();
    renderAppAt('/assignments');

    await user.click(screen.getByRole('link', { name: 'Cấu hình rubric' }));

    // Nếu `onFollow` không `preventDefault` + `navigate`, jsdom sẽ không đổi
    // nội dung và heading dưới đây không xuất hiện.
    expect(await screen.findByRole('heading', { level: 1, name: 'Cấu hình rubric' })).toBeDefined();
  });
});

describe('AdminLayout - đăng xuất', () => {
  it('gọi logout và đưa về trang đăng nhập', async () => {
    const user = userEvent.setup();
    renderAppAt('/assignments');

    await user.click(screen.getByRole('button', { name: 'Tài khoản đang đăng nhập' }));
    // Sau khi đăng xuất, provider set admin = null -> guard đẩy về /login.
    getCurrentAdmin.mockReturnValue(null);
    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

    await waitFor(() => {
      expect(logout).toHaveBeenCalledTimes(1);
    });
    expect(await screen.findByLabelText('Tên đăng nhập')).toBeDefined();
  });

  it('vẫn đăng xuất khỏi UI dù request xác nhận thất bại', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    logout.mockRejectedValue(new TypeError('Failed to fetch'));

    renderAppAt('/assignments');
    await user.click(screen.getByRole('button', { name: 'Tài khoản đang đăng nhập' }));
    getCurrentAdmin.mockReturnValue(null);
    await user.click(screen.getByRole('menuitem', { name: 'Đăng xuất' }));

    // Lỗi mạng không được giữ người dùng lại trong khu vực Admin.
    expect(await screen.findByLabelText('Tên đăng nhập')).toBeDefined();
  });
});
