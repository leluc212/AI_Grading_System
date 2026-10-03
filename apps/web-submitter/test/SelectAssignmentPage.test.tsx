/**
 * Test trang chọn Assignment (task 5.2).
 *
 * Trọng tâm: Requirement 1.7 — Submitter chỉ thấy và chỉ chọn được đợt chấm
 * đang `OPEN`, và việc chọn phải dẫn đúng sang form nộp bài của đợt đó.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const openAssignment = makeAssignment({
  assignmentId: 'open-1',
  assignmentName: 'Đợt 1 - Lập trình Web - K21',
  status: 'OPEN',
});
const closedAssignment = makeAssignment({
  assignmentId: 'closed-1',
  assignmentName: 'Đợt 2 - Cấu trúc dữ liệu - K20',
  status: 'CLOSED',
});

beforeEach(() => {
  vi.clearAllMocks();
  getAssignment.mockResolvedValue(openAssignment);
});

describe('SelectAssignmentPage', () => {
  it('hiển thị trạng thái đang tải trước khi có dữ liệu', async () => {
    listAssignments.mockReturnValue(new Promise(() => {}));

    renderAppAt('/');

    expect(screen.getByText('Đang tải danh sách đợt chấm...')).toBeDefined();
  });

  it('chỉ hiển thị assignment đang OPEN, ẩn assignment đã CLOSED', async () => {
    listAssignments.mockResolvedValue([openAssignment, closedAssignment]);

    renderAppAt('/');

    expect(await screen.findByText('Đợt 1 - Lập trình Web - K21')).toBeDefined();
    // Requirement 1.7: đợt đã đóng không được xuất hiện như một lựa chọn.
    expect(screen.queryByText('Đợt 2 - Cấu trúc dữ liệu - K20')).toBeNull();
  });

  it('hiển thị empty state khi không có đợt chấm nào đang mở', async () => {
    listAssignments.mockResolvedValue([closedAssignment]);

    renderAppAt('/');

    expect(await screen.findByText('Hiện không có đợt chấm nào đang mở')).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Nộp bài cho đợt chấm/ })).toBeNull();
  });

  it('bấm "Nộp bài" điều hướng sang form nộp bài của đúng assignment đã chọn', async () => {
    const user = userEvent.setup();
    listAssignments.mockResolvedValue([openAssignment, closedAssignment]);

    renderAppAt('/');

    await user.click(
      await screen.findByRole('button', {
        name: 'Nộp bài cho đợt chấm Đợt 1 - Lập trình Web - K21',
      }),
    );

    expect(await screen.findByText('Đợt chấm: Đợt 1 - Lập trình Web - K21')).toBeDefined();
    expect(getAssignment).toHaveBeenCalledWith('open-1');
  });

  it('hiển thị lỗi kèm nút thử lại khi không tải được danh sách', async () => {
    const user = userEvent.setup();
    // Lỗi mạng thô (không phải DomainError) -> phải hiện câu fallback thân
    // thiện, không hiện "Failed to fetch".
    listAssignments.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderAppAt('/');

    expect(
      await screen.findByText('Không tải được danh sách đợt chấm. Vui lòng thử lại.'),
    ).toBeDefined();
    expect(screen.queryByText('Failed to fetch')).toBeNull();

    // "Thử lại" phải gọi lại service và render được danh sách.
    listAssignments.mockResolvedValue([openAssignment]);
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Đợt 1 - Lập trình Web - K21')).toBeDefined();
    await waitFor(() => {
      expect(listAssignments).toHaveBeenCalledTimes(2);
    });
  });
});
