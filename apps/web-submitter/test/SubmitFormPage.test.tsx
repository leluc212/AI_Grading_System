/**
 * Test cổng kiểm tra Assignment ở trang form nộp bài (task 5.2).
 *
 * Trọng tâm: Requirement 1.8 — truy cập trực tiếp URL của 1 đợt chấm đã
 * `CLOSED` phải bị từ chối kèm thông báo rõ ràng, và form KHÔNG được render.
 * Đây là kịch bản gõ tay URL / dùng lại link cũ, thứ mà việc lọc danh sách ở
 * `SelectAssignmentPage` không chặn được.
 *
 * Test phần thân form (thêm/xoá thành viên, validate file, submit) sẽ được
 * bổ sung ở task 5.7 sau khi task 5.3 - 5.6 hiện thực xong.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotFoundError } from '@quick-grading/shared-types';
import { assignmentsApi } from '../src/services';
import { makeAssignment } from './fixtures';
import { renderAppAt } from './renderApp';

vi.mock('../src/services', () => ({
  assignmentsApi: {
    listAssignments: vi.fn(),
    getAssignment: vi.fn(),
  },
  teamsApi: {
    createTeamAndSubmit: vi.fn(),
  },
}));

const listAssignments = vi.mocked(assignmentsApi.listAssignments);
const getAssignment = vi.mocked(assignmentsApi.getAssignment);

/**
 * Dấu hiệu nhận biết form đã được render: nút nộp bài. Dùng nút (chứ không
 * dùng 1 ô nhập) vì đó là thứ duy nhất có thể dẫn tới việc gửi dữ liệu — còn
 * thấy nút nghĩa là cổng kiểm tra đã cho phép nộp.
 */
const SUBMIT_BUTTON_NAME = 'Nộp bài';

/** True nếu form nộp bài đang hiển thị (phân biệt với heading h2 cùng tên). */
function isFormVisible(): boolean {
  return screen.queryByRole('button', { name: SUBMIT_BUTTON_NAME }) !== null;
}

beforeEach(() => {
  vi.clearAllMocks();
  listAssignments.mockResolvedValue([]);
});

describe('SubmitFormPage - cổng kiểm tra Assignment', () => {
  it('hiển thị trạng thái đang kiểm tra trước khi có dữ liệu', () => {
    getAssignment.mockReturnValue(new Promise(() => {}));

    renderAppAt('/submit/open-1');

    expect(screen.getByText('Đang kiểm tra đợt chấm...')).toBeDefined();
    expect(isFormVisible()).toBe(false);
  });

  it('cho phép điền form khi assignment đang OPEN', async () => {
    getAssignment.mockResolvedValue(
      makeAssignment({ assignmentId: 'open-1', assignmentName: 'Đợt mở', status: 'OPEN' }),
    );

    renderAppAt('/submit/open-1');

    expect(await screen.findByText('Đợt chấm: Đợt mở')).toBeDefined();
    expect(isFormVisible()).toBe(true);
    expect(screen.queryByText('Đợt chấm đã đóng')).toBeNull();
  });

  it('chặn và thông báo khi assignment đã CLOSED, không render form', async () => {
    getAssignment.mockResolvedValue(
      makeAssignment({
        assignmentId: 'closed-1',
        assignmentName: 'Đợt 2 - Cấu trúc dữ liệu - K20',
        status: 'CLOSED',
      }),
    );

    renderAppAt('/submit/closed-1');

    expect(await screen.findByText('Đợt chấm đã đóng')).toBeDefined();
    expect(
      screen.getByText(/Đợt 2 - Cấu trúc dữ liệu - K20.*đã đóng, không thể nộp bài/),
    ).toBeDefined();
    // Requirement 1.8: từ chối nghĩa là không có form để điền.
    expect(isFormVisible()).toBe(false);
  });

  it('cho phép quay lại danh sách đợt chấm từ thông báo đã đóng', async () => {
    const user = userEvent.setup();
    getAssignment.mockResolvedValue(makeAssignment({ status: 'CLOSED' }));

    renderAppAt('/submit/closed-1');

    await user.click(await screen.findByRole('button', { name: 'Chọn đợt chấm khác' }));

    expect(await screen.findByText('Hiện không có đợt chấm nào đang mở')).toBeDefined();
  });

  it('hiển thị thông báo của NotFoundError khi assignment không tồn tại', async () => {
    getAssignment.mockRejectedValue(new NotFoundError('Assignment', 'khong-ton-tai'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderAppAt('/submit/khong-ton-tai');

    expect(
      await screen.findByText('Không tìm thấy Assignment với id "khong-ton-tai".'),
    ).toBeDefined();
    expect(isFormVisible()).toBe(false);
  });

  it('hiển thị câu fallback (không lộ lỗi kỹ thuật) khi gặp lỗi mạng', async () => {
    getAssignment.mockRejectedValue(new TypeError('Failed to fetch'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderAppAt('/submit/open-1');

    expect(
      await screen.findByText('Không tải được thông tin đợt chấm. Vui lòng thử lại.'),
    ).toBeDefined();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
    expect(isFormVisible()).toBe(false);
  });
});
