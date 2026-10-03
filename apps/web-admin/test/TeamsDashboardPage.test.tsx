/**
 * Test dashboard danh sách nhóm (task 8.1).
 *
 * _Requirements: 5.1, 5.2_
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GradingResult } from '@quick-grading/shared-types';
import { assignmentsApi, authApi, gradingApi, teamsApi } from '../src/services';
import { makeAssignment, makeGradingResult, makeMember, makeTeam } from './fixtures';
import { renderAppAt, seedAdminSession } from './renderApp';

vi.mock('../src/services', async () => (await import('./servicesMock')).createServicesMock());

const listTeams = vi.mocked(teamsApi.listTeams);
const getLatestGrading = vi.mocked(gradingApi.getLatestGrading);

const ASSIGNMENT = makeAssignment({ assignmentId: 'a-1', assignmentName: 'Đợt 1 - K21' });

/** 4 nhóm phủ 4 trạng thái chấm bài khác nhau. */
const TEAM_NOT_GRADED = makeTeam({
  teamId: 't-chua-cham',
  teamName: 'Nhóm Chưa Chấm',
  members: [makeMember({ memberId: 'm1' }), makeMember({ memberId: 'm2' })],
});
const TEAM_GRADED = makeTeam({ teamId: 't-da-cham', teamName: 'Nhóm Đã Chấm' });
const TEAM_NEEDS_REVIEW = makeTeam({ teamId: 't-can-review', teamName: 'Nhóm Cần Review' });
const TEAM_FAILED = makeTeam({ teamId: 't-loi', teamName: 'Nhóm Lỗi' });

/** Lượt chấm gần nhất tương ứng từng nhóm (map theo teamId). */
const LATEST_BY_TEAM: Record<string, GradingResult | null> = {
  't-chua-cham': null,
  't-da-cham': makeGradingResult({ teamId: 't-da-cham', score: 88 }),
  't-can-review': makeGradingResult({
    teamId: 't-can-review',
    score: 65,
    needsReview: true,
    reviewStatus: 'PENDING_REVIEW',
  }),
  't-loi': makeGradingResult({
    teamId: 't-loi',
    status: 'FAILED',
    score: undefined,
    gradedAt: undefined,
    errorMessage: 'AI Grader timeout.',
  }),
};

beforeEach(() => {
  vi.clearAllMocks();
  seedAdminSession('admin');
  vi.mocked(authApi.getCurrentAdmin).mockReturnValue({ username: 'admin' });
  vi.mocked(assignmentsApi.getAssignment).mockResolvedValue(ASSIGNMENT);
  listTeams.mockResolvedValue([TEAM_NOT_GRADED, TEAM_GRADED, TEAM_NEEDS_REVIEW, TEAM_FAILED]);
  getLatestGrading.mockImplementation((teamId: string) =>
    Promise.resolve(LATEST_BY_TEAM[teamId] ?? null),
  );
  vi.mocked(teamsApi.getTeam).mockResolvedValue(TEAM_GRADED);
  vi.mocked(teamsApi.getTeamFiles).mockResolvedValue({ md: '# md', xml: '<x/>' });
  vi.mocked(gradingApi.listGradingHistory).mockResolvedValue([]);
});

/** Lấy dòng của bảng chứa tên nhóm cho trước. */
function rowOf(teamName: string): HTMLElement {
  const cell = screen.getByText(teamName);
  const row = cell.closest('tr');
  if (row === null) {
    throw new Error(`Không tìm thấy dòng của nhóm ${teamName}`);
  }
  return row;
}

describe('TeamsDashboardPage - danh sách (Requirement 5.1)', () => {
  it('hiển thị tên đợt chấm trong tiêu đề', async () => {
    renderAppAt('/assignments/a-1/teams');

    expect(await screen.findByText('Đợt chấm: Đợt 1 - K21')).toBeDefined();
  });

  it('hiển thị tên nhóm, số thành viên và trạng thái nộp bài', async () => {
    renderAppAt('/assignments/a-1/teams');
    // Phải chờ dữ liệu về trước khi tra cứu dòng — bảng ban đầu đang loading.
    await screen.findByText('Nhóm Chưa Chấm');

    const row = rowOf('Nhóm Chưa Chấm');
    // Nhóm này có 2 thành viên.
    expect(within(row).getByText('2')).toBeDefined();
    expect(within(row).getByText('Đã nộp')).toBeDefined();
  });

  it('quy đổi đúng trạng thái chấm bài cho từng nhóm', async () => {
    renderAppAt('/assignments/a-1/teams');

    expect(await screen.findByText('Nhóm Chưa Chấm')).toBeDefined();
    expect(within(rowOf('Nhóm Chưa Chấm')).getByText('Chưa chấm')).toBeDefined();
    expect(within(rowOf('Nhóm Đã Chấm')).getByText('Đã chấm')).toBeDefined();
    expect(within(rowOf('Nhóm Cần Review')).getByText('Cần review')).toBeDefined();
    expect(within(rowOf('Nhóm Lỗi')).getByText('Lỗi')).toBeDefined();
  });

  it('hiển thị điểm, và dấu gạch ngang cho nhóm chưa có điểm', async () => {
    renderAppAt('/assignments/a-1/teams');

    expect(await screen.findByText('Nhóm Đã Chấm')).toBeDefined();
    expect(within(rowOf('Nhóm Đã Chấm')).getByText('88')).toBeDefined();
    // Requirement 10.3 (tinh thần): không để trống gây nhầm với điểm 0.
    expect(within(rowOf('Nhóm Chưa Chấm')).getByText('—')).toBeDefined();
  });

  it('một nhóm lỗi khi đọc lịch sử chấm không làm sập cả bảng', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getLatestGrading.mockImplementation((teamId: string) =>
      teamId === 't-loi'
        ? Promise.reject(new TypeError('Failed to fetch'))
        : Promise.resolve(LATEST_BY_TEAM[teamId] ?? null),
    );

    renderAppAt('/assignments/a-1/teams');

    // Các nhóm khác vẫn hiện bình thường, nhóm lỗi hiện "Chưa chấm".
    expect(await screen.findByText('Nhóm Đã Chấm')).toBeDefined();
    expect(within(rowOf('Nhóm Lỗi')).getByText('Chưa chấm')).toBeDefined();
  });

  it('hiển thị empty state khi đợt chấm chưa có nhóm nào', async () => {
    listTeams.mockResolvedValue([]);

    renderAppAt('/assignments/a-1/teams');

    expect(await screen.findByText('Chưa có nhóm nào trong đợt chấm này')).toBeDefined();
  });

  it('hiển thị lỗi kèm nút thử lại khi không tải được danh sách nhóm', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    listTeams.mockRejectedValue(new TypeError('Failed to fetch'));

    renderAppAt('/assignments/a-1/teams');

    expect(
      await screen.findByText('Không tải được danh sách nhóm. Vui lòng thử lại.'),
    ).toBeDefined();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });
});

describe('TeamsDashboardPage - bộ lọc (Requirement 5.2)', () => {
  /** Chọn 1 giá trị trong `Select` lọc theo trạng thái chấm bài. */
  async function selectFilter(user: ReturnType<typeof userEvent.setup>, optionLabel: string) {
    await user.click(screen.getByRole('button', { name: /Lọc theo trạng thái chấm bài/ }));
    await user.click(await screen.findByRole('option', { name: optionLabel }));
  }

  it('lọc ra đúng các nhóm cần review', async () => {
    const user = userEvent.setup();
    renderAppAt('/assignments/a-1/teams');
    await screen.findByText('Nhóm Cần Review');

    await selectFilter(user, 'Cần review');

    expect(screen.getByText('Nhóm Cần Review')).toBeDefined();
    expect(screen.queryByText('Nhóm Đã Chấm')).toBeNull();
    expect(screen.queryByText('Nhóm Chưa Chấm')).toBeNull();
    expect(screen.queryByText('Nhóm Lỗi')).toBeNull();
  });

  it('lọc ra đúng các nhóm chưa chấm', async () => {
    const user = userEvent.setup();
    renderAppAt('/assignments/a-1/teams');
    await screen.findByText('Nhóm Chưa Chấm');

    await selectFilter(user, 'Chưa chấm');

    expect(screen.getByText('Nhóm Chưa Chấm')).toBeDefined();
    expect(screen.queryByText('Nhóm Đã Chấm')).toBeNull();
  });

  it('hiển thị empty state riêng khi bộ lọc không khớp nhóm nào', async () => {
    const user = userEvent.setup();
    listTeams.mockResolvedValue([TEAM_GRADED]);
    renderAppAt('/assignments/a-1/teams');
    await screen.findByText('Nhóm Đã Chấm');

    await selectFilter(user, 'Lỗi');

    // Khác hẳn empty state "chưa có nhóm nào" — ở đây có nhóm, chỉ là bị lọc hết.
    expect(screen.getByText('Không có nhóm nào khớp bộ lọc')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Xoá bộ lọc' })).toBeDefined();
  });

  it('nút "Xoá bộ lọc" đưa danh sách về đầy đủ', async () => {
    const user = userEvent.setup();
    listTeams.mockResolvedValue([TEAM_GRADED]);
    renderAppAt('/assignments/a-1/teams');
    await screen.findByText('Nhóm Đã Chấm');

    await selectFilter(user, 'Lỗi');
    await user.click(screen.getByRole('button', { name: 'Xoá bộ lọc' }));

    expect(screen.getByText('Nhóm Đã Chấm')).toBeDefined();
  });
});

describe('TeamsDashboardPage - điều hướng', () => {
  it('bấm tên nhóm mở trang chi tiết nhóm', async () => {
    const user = userEvent.setup();
    renderAppAt('/assignments/a-1/teams');

    await user.click(await screen.findByRole('link', { name: 'Nhóm Đã Chấm' }));

    await waitFor(() => {
      expect(teamsApi.getTeam).toHaveBeenCalledWith('t-da-cham');
    });
  });
});
