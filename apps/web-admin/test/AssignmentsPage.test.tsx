/**
 * Test trang danh sách Assignment (task 7.1, 7.2).
 *
 * _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotFoundError, ValidationError } from '@quick-grading/shared-types';
import { assignmentsApi, authApi, exportApi, gradingApi, teamsApi } from '../src/services';
import { makeAssignment, makeTeam } from './fixtures';
import { renderAppAt, seedAdminSession } from './renderApp';

vi.mock('../src/services', async () => (await import('./servicesMock')).createServicesMock());

const listAssignments = vi.mocked(assignmentsApi.listAssignments);
const createAssignment = vi.mocked(assignmentsApi.createAssignment);
const setAssignmentStatus = vi.mocked(assignmentsApi.setAssignmentStatus);

const OPEN_ASSIGNMENT = makeAssignment({
  assignmentId: 'a-open',
  assignmentName: 'Đợt 1 - Lập trình Web - K21',
  status: 'OPEN',
  submittedTeamCount: 3,
});
const CLOSED_ASSIGNMENT = makeAssignment({
  assignmentId: 'a-closed',
  assignmentName: 'Đợt 2 - Cấu trúc dữ liệu - K20',
  status: 'CLOSED',
  submittedTeamCount: 7,
});

beforeEach(() => {
  vi.clearAllMocks();
  seedAdminSession('admin');
  vi.mocked(authApi.getCurrentAdmin).mockReturnValue({ username: 'admin' });
  listAssignments.mockResolvedValue([OPEN_ASSIGNMENT, CLOSED_ASSIGNMENT]);
  // Test điều hướng rơi sang dashboard nhóm, nên các API mà trang đó gọi khi
  // mount cũng phải có hành vi — nếu để `vi.fn()` trần, nó trả `undefined` và
  // `.catch(...)` trên `undefined` sẽ throw ngay.
  vi.mocked(assignmentsApi.getAssignment).mockResolvedValue(OPEN_ASSIGNMENT);
  vi.mocked(teamsApi.listTeams).mockResolvedValue([makeTeam()]);
  vi.mocked(gradingApi.getLatestGrading).mockResolvedValue(null);
});

describe('AssignmentsPage - danh sách (Requirement 1.3)', () => {
  it('hiển thị tên, trạng thái và số nhóm đã nộp của từng đợt chấm', async () => {
    renderAppAt('/assignments');

    expect(await screen.findByText('Đợt 1 - Lập trình Web - K21')).toBeDefined();
    expect(screen.getByText('Đợt 2 - Cấu trúc dữ liệu - K20')).toBeDefined();
    expect(screen.getByText('Đang mở')).toBeDefined();
    expect(screen.getByText('Đã đóng')).toBeDefined();
    // Số nhóm đã nộp lấy từ `submittedTeamCount` do server tính.
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText('7')).toBeDefined();
  });

  it('hiển thị empty state khi chưa có đợt chấm nào', async () => {
    listAssignments.mockResolvedValue([]);

    renderAppAt('/assignments');

    expect(await screen.findByText('Chưa có đợt chấm nào')).toBeDefined();
  });

  it('hiển thị lỗi kèm nút thử lại khi không tải được danh sách', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    listAssignments.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    renderAppAt('/assignments');

    expect(
      await screen.findByText('Không tải được danh sách đợt chấm. Vui lòng thử lại.'),
    ).toBeDefined();
    expect(screen.queryByText('Failed to fetch')).toBeNull();

    listAssignments.mockResolvedValue([OPEN_ASSIGNMENT]);
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Đợt 1 - Lập trình Web - K21')).toBeDefined();
  });

  it('bấm tên đợt chấm chuyển sang dashboard nhóm của đợt đó', async () => {
    const user = userEvent.setup();
    renderAppAt('/assignments');

    await user.click(await screen.findByRole('link', { name: 'Đợt 1 - Lập trình Web - K21' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Danh sách nhóm' })).toBeDefined();
    await waitFor(() => {
      expect(teamsApi.listTeams).toHaveBeenCalledWith('a-open');
    });
  });
});

describe('AssignmentsPage - đóng/mở (Requirement 1.4, 1.5)', () => {
  it('đóng đợt chấm đang mở và tải lại danh sách', async () => {
    const user = userEvent.setup();
    setAssignmentStatus.mockResolvedValue({ ...OPEN_ASSIGNMENT, status: 'CLOSED' });

    renderAppAt('/assignments');
    await user.click(
      await screen.findByRole('button', { name: 'Đóng đợt chấm Đợt 1 - Lập trình Web - K21' }),
    );

    await waitFor(() => {
      expect(setAssignmentStatus).toHaveBeenCalledWith('a-open', 'CLOSED');
    });
    expect(await screen.findByText(/Đã đóng đợt chấm .*Nhóm không thể nộp bài/)).toBeDefined();
    // Tải lại để `submittedTeamCount` của mọi đợt luôn đúng.
    await waitFor(() => {
      expect(listAssignments).toHaveBeenCalledTimes(2);
    });
  });

  it('mở lại đợt chấm đã đóng', async () => {
    const user = userEvent.setup();
    setAssignmentStatus.mockResolvedValue({ ...CLOSED_ASSIGNMENT, status: 'OPEN' });

    renderAppAt('/assignments');
    await user.click(
      await screen.findByRole('button', {
        name: 'Mở lại đợt chấm Đợt 2 - Cấu trúc dữ liệu - K20',
      }),
    );

    await waitFor(() => {
      expect(setAssignmentStatus).toHaveBeenCalledWith('a-closed', 'OPEN');
    });
    expect(await screen.findByText(/Đã mở lại đợt chấm .*nộp bài trở lại/)).toBeDefined();
  });

  it('hiển thị lỗi khi đổi trạng thái thất bại', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    setAssignmentStatus.mockRejectedValue(new TypeError('Failed to fetch'));

    renderAppAt('/assignments');
    await user.click(
      await screen.findByRole('button', { name: 'Đóng đợt chấm Đợt 1 - Lập trình Web - K21' }),
    );

    expect(
      await screen.findByText('Không đổi được trạng thái đợt chấm. Vui lòng thử lại.'),
    ).toBeDefined();
  });
});

describe('CreateAssignmentModal - tạo đợt chấm (Requirement 1.1, 1.2)', () => {
  /** Mở modal tạo đợt chấm. */
  async function openCreateModal(user: ReturnType<typeof userEvent.setup>) {
    renderAppAt('/assignments');
    await user.click(await screen.findByRole('button', { name: 'Tạo đợt chấm' }));
    return screen.findByLabelText('Tên đợt chấm');
  }

  it('không gọi API khi tên để trống (Requirement 1.2)', async () => {
    const user = userEvent.setup();
    await openCreateModal(user);

    await user.click(screen.getByRole('button', { name: 'Tạo' }));

    expect(createAssignment).not.toHaveBeenCalled();
    expect(screen.getByText('Tên đợt chấm không được để trống.')).toBeDefined();
  });

  it('không gọi API khi tên chỉ gồm khoảng trắng (Requirement 1.2)', async () => {
    const user = userEvent.setup();
    const input = await openCreateModal(user);

    await user.type(input, '    ');
    await user.click(screen.getByRole('button', { name: 'Tạo' }));

    expect(createAssignment).not.toHaveBeenCalled();
    expect(screen.getByText('Tên đợt chấm không được để trống.')).toBeDefined();
  });

  it('tạo thành công với tên đã cắt khoảng trắng rồi tải lại danh sách', async () => {
    const user = userEvent.setup();
    createAssignment.mockResolvedValue(makeAssignment({ assignmentName: 'Đợt 3 - K22' }));

    const input = await openCreateModal(user);
    await user.type(input, '   Đợt 3 - K22   ');
    await user.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() => {
      expect(createAssignment).toHaveBeenCalledWith({ assignmentName: 'Đợt 3 - K22' });
    });
    expect(await screen.findByText('Đã tạo đợt chấm "Đợt 3 - K22".')).toBeDefined();
    await waitFor(() => {
      expect(listAssignments).toHaveBeenCalledTimes(2);
    });
  });

  it('hiển thị lỗi validate của server và giữ modal mở', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createAssignment.mockRejectedValue(new ValidationError('Tên Assignment không được để trống.'));

    const input = await openCreateModal(user);
    await user.type(input, 'Đợt 3');
    await user.click(screen.getByRole('button', { name: 'Tạo' }));

    expect(await screen.findByText('Tên Assignment không được để trống.')).toBeDefined();
    // Modal còn mở để Admin sửa, không bị đóng mất dữ liệu đã nhập.
    expect(screen.getByLabelText('Tên đợt chấm')).toBeDefined();
  });

  it('dọn sạch form khi mở modal lần sau', async () => {
    const user = userEvent.setup();
    const input = await openCreateModal(user);
    await user.type(input, 'Nhập dở rồi huỷ');
    await user.click(screen.getByRole('button', { name: 'Huỷ' }));

    await user.click(screen.getByRole('button', { name: 'Tạo đợt chấm' }));

    expect((await screen.findByLabelText('Tên đợt chấm')).getAttribute('value')).toBe('');
  });
});

describe('AssignmentsPage - xuất Excel (Requirement 10.1, 10.4)', () => {
  /**
   * jsdom không hiện thực object URL và cũng không tải file được, nên stub
   * `URL.createObjectURL`/`revokeObjectURL` và vô hiệu hoá click trên thẻ `<a>`
   * tạm. Phần dựng file `.xlsx` thật đã được kiểm riêng ở `excelExport.test.ts`.
   */
  function stubDownload(): { createObjectURL: ReturnType<typeof vi.fn> } {
    const createObjectURL = vi.fn(() => 'blob:fake-url');
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL: vi.fn() });

    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = realCreateElement(tagName);
      if (tagName === 'a') {
        (element as HTMLAnchorElement).click = () => {};
      }
      return element;
    });

    return { createObjectURL };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('lấy dữ liệu export của đúng đợt chấm rồi tạo file tải xuống', async () => {
    const user = userEvent.setup();
    const { createObjectURL } = stubDownload();
    vi.mocked(exportApi.getAssignmentExportData).mockResolvedValue({
      assignmentId: 'a-open',
      assignmentName: 'Đợt 1 - Lập trình Web - K21',
      rows: [
        {
          teamName: 'Nhóm Rồng Vàng',
          members: [{ memberName: 'Nguyễn Văn An', studentCode: 'SV001' }],
          finalDisplayScore: 85,
          reviewStatus: 'REVIEWED',
          gradedAt: '2024-09-02T10:00:00.000Z',
        },
      ],
    });

    renderAppAt('/assignments');
    await user.click(
      await screen.findByRole('button', {
        name: 'Xuất Excel đợt chấm Đợt 1 - Lập trình Web - K21',
      }),
    );

    await waitFor(() => {
      expect(exportApi.getAssignmentExportData).toHaveBeenCalledWith('a-open');
    });
    // Requirement 10.4: file được tải trực tiếp từ trình duyệt.
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    });
    expect(
      await screen.findByText(/Đã tạo file "diem-dot-1-lap-trinh-web-k21-.*\.xlsx"/),
    ).toBeDefined();
  });

  it('hiển thị lỗi khi không lấy được dữ liệu export', async () => {
    const user = userEvent.setup();
    stubDownload();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(exportApi.getAssignmentExportData).mockRejectedValue(
      new NotFoundError('Assignment', 'a-open'),
    );

    renderAppAt('/assignments');
    await user.click(
      await screen.findByRole('button', {
        name: 'Xuất Excel đợt chấm Đợt 1 - Lập trình Web - K21',
      }),
    );

    expect(await screen.findByText('Không tìm thấy Assignment với id "a-open".')).toBeDefined();
  });

  it('xuất được cả đợt chấm đã đóng', async () => {
    const user = userEvent.setup();
    const { createObjectURL } = stubDownload();
    vi.mocked(exportApi.getAssignmentExportData).mockResolvedValue({
      assignmentId: 'a-closed',
      assignmentName: 'Đợt 2 - Cấu trúc dữ liệu - K20',
      rows: [],
    });

    renderAppAt('/assignments');
    await user.click(
      await screen.findByRole('button', {
        name: 'Xuất Excel đợt chấm Đợt 2 - Cấu trúc dữ liệu - K20',
      }),
    );

    // Đóng đợt chấm chỉ chặn nộp bài, không chặn việc lấy điểm ra.
    await waitFor(() => {
      expect(exportApi.getAssignmentExportData).toHaveBeenCalledWith('a-closed');
    });
    // Phải `waitFor`: sau khi có dữ liệu còn 1 nhịp async nữa để import động
    // `exceljs` và ghi buffer, nên object URL chưa được tạo ngay.
    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalledTimes(1);
    });
  });
});
