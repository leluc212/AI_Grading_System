/**
 * Test route guard khu vực Admin (task 6.2).
 *
 * Trọng tâm: Requirement 4.1 và 4.5 — KHÔNG route Admin nào render được khi
 * chưa đăng nhập. Test duyệt qua toàn bộ path có trong bảng route để nếu sau
 * này ai thêm route mới mà đặt sai chỗ (ngoài guard) thì sẽ bị phát hiện.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { assignmentsApi, authApi, gradingApi, rubricsApi, teamsApi } from '../src/services';
import { makeAssignment, makeTeam } from './fixtures';
import { renderAppAt, seedAdminSession } from './renderApp';

vi.mock('../src/services', async () => (await import('./servicesMock')).createServicesMock());

const getCurrentAdmin = vi.mocked(authApi.getCurrentAdmin);

/** Tất cả path thuộc khu vực Admin (phải khớp bảng route trong `App.tsx`). */
const PROTECTED_PATHS = [
  '/',
  '/assignments',
  '/assignments/a-1/teams',
  '/teams/t-1',
  '/rubric',
  '/duong-dan-khong-ton-tai',
];

/** Dấu hiệu đang ở trang đăng nhập. */
function isOnLoginPage(): boolean {
  return screen.queryByLabelText('Tên đăng nhập') !== null;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Mặc định: chưa đăng nhập.
  getCurrentAdmin.mockReturnValue(null);
  // Các trang Admin gọi API ngay khi mount. Test này chỉ quan tâm route guard,
  // nên cho mọi lời gọi trả dữ liệu rỗng/tối thiểu để không nhiễu.
  vi.mocked(assignmentsApi.listAssignments).mockResolvedValue([]);
  vi.mocked(assignmentsApi.getAssignment).mockResolvedValue(makeAssignment());
  vi.mocked(teamsApi.listTeams).mockResolvedValue([]);
  vi.mocked(teamsApi.getTeam).mockResolvedValue(makeTeam());
  vi.mocked(teamsApi.getTeamFiles).mockResolvedValue({ md: '', xml: '' });
  vi.mocked(gradingApi.listGradingHistory).mockResolvedValue([]);
  vi.mocked(gradingApi.getLatestGrading).mockResolvedValue(null);
  vi.mocked(rubricsApi.getActiveRubric).mockResolvedValue(null);
  vi.mocked(rubricsApi.listRubricVersions).mockResolvedValue([]);
});

describe('RequireAdminAuth - chưa đăng nhập', () => {
  it.each(PROTECTED_PATHS)('chặn truy cập %s và đưa về trang đăng nhập', (path) => {
    renderAppAt(path);

    expect(isOnLoginPage()).toBe(true);
  });

  it('không render khung Admin (menu điều hướng) khi chưa đăng nhập', () => {
    renderAppAt('/assignments');

    expect(screen.queryByRole('link', { name: 'Đợt chấm' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tạo đợt chấm' })).toBeNull();
    // Quan trọng: trang bị chặn thì KHÔNG được gọi API Admin nào.
    expect(assignmentsApi.listAssignments).not.toHaveBeenCalled();
  });
});

describe('RequireAdminAuth - đã đăng nhập', () => {
  beforeEach(() => {
    seedAdminSession('admin');
    getCurrentAdmin.mockReturnValue({ username: 'admin' });
  });

  it('cho vào trang danh sách đợt chấm', () => {
    renderAppAt('/assignments');

    expect(screen.getByRole('heading', { level: 1, name: 'Đợt chấm' })).toBeDefined();
    expect(isOnLoginPage()).toBe(false);
  });

  it('route "/" chuyển sang /assignments', () => {
    renderAppAt('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Đợt chấm' })).toBeDefined();
  });

  it('URL lạ cũng được đưa về /assignments', () => {
    renderAppAt('/khong-ton-tai');

    expect(screen.getByRole('heading', { level: 1, name: 'Đợt chấm' })).toBeDefined();
  });

  it('truyền tham số URL xuống trang danh sách nhóm', async () => {
    renderAppAt('/assignments/a-1/teams');

    expect(screen.getByRole('heading', { level: 1, name: 'Danh sách nhóm' })).toBeDefined();
    // Tham số URL phải tới đúng lớp service, không chỉ hiển thị trên trang.
    await waitFor(() => {
      expect(teamsApi.listTeams).toHaveBeenCalledWith('a-1');
    });
  });

  it('truyền tham số URL xuống trang chi tiết nhóm', async () => {
    renderAppAt('/teams/t-1');

    expect(screen.getByRole('heading', { level: 1, name: 'Chi tiết nhóm' })).toBeDefined();
    await waitFor(() => {
      expect(teamsApi.getTeam).toHaveBeenCalledWith('t-1');
    });
  });

  it('mở được trang cấu hình rubric', () => {
    renderAppAt('/rubric');

    expect(screen.getByRole('heading', { level: 1, name: 'Cấu hình rubric' })).toBeDefined();
  });

  it('mở /login khi đã đăng nhập thì chuyển vào khu vực Admin', () => {
    renderAppAt('/login');

    expect(isOnLoginPage()).toBe(false);
    expect(screen.getByRole('heading', { level: 1, name: 'Đợt chấm' })).toBeDefined();
  });

  it('đọc phiên từ localStorage ngay lần render đầu (F5 không bị đăng xuất)', () => {
    renderAppAt('/rubric');

    // Nếu provider khởi tạo state trong useEffect thay vì trong useState
    // initializer, lần render đầu sẽ thấy `null` và guard đã đẩy về /login.
    expect(screen.getByRole('heading', { level: 1, name: 'Cấu hình rubric' })).toBeDefined();
    expect(getCurrentAdmin).toHaveBeenCalled();
  });
});
