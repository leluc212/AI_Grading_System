/**
 * Test trang chi tiết nhóm + FileViewer + GradingHistoryList (task 8.2, 8.3).
 *
 * _Requirements: 5.3, 5.4, 6.6, 7.5, 11.4_
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotFoundError, ValidationError } from '@quick-grading/shared-types';
import { authApi, gradingApi, teamsApi } from '../src/services';
import { makeGradingResult, makeMember, makeTeam } from './fixtures';
import { renderAppAt, seedAdminSession } from './renderApp';

vi.mock('../src/services', async () => (await import('./servicesMock')).createServicesMock());

const getTeam = vi.mocked(teamsApi.getTeam);
const getTeamFiles = vi.mocked(teamsApi.getTeamFiles);
const listGradingHistory = vi.mocked(gradingApi.listGradingHistory);

const TEAM = makeTeam({
  teamId: 't-1',
  teamName: 'Nhóm Rồng Vàng',
  members: [
    makeMember({
      memberId: 'm-1',
      memberName: 'Nguyễn Văn An',
      email: 'an@example.com',
      studentCode: 'SV001',
    }),
    // Thành viên không có MSSV — MSSV là tuỳ chọn (Requirement 2.2).
    makeMember({
      memberId: 'm-2',
      memberName: 'Trần Thị Bình',
      email: 'binh@example.com',
      studentCode: undefined,
    }),
  ],
});

const MARKDOWN = '# Tiêu đề bài làm\n\nĐoạn mô tả của nhóm.';
const XML = '<root><item id="1">giá trị</item></root>';

beforeEach(() => {
  vi.clearAllMocks();
  seedAdminSession('admin');
  vi.mocked(authApi.getCurrentAdmin).mockReturnValue({ username: 'admin' });
  getTeam.mockResolvedValue(TEAM);
  getTeamFiles.mockResolvedValue({ md: MARKDOWN, xml: XML });
  listGradingHistory.mockResolvedValue([]);
});

describe('TeamDetailPage - thông tin nhóm (Requirement 5.3)', () => {
  it('hiển thị tên nhóm làm tiêu đề và trạng thái nộp bài', async () => {
    renderAppAt('/teams/t-1');

    expect(await screen.findByRole('heading', { level: 1, name: 'Nhóm Rồng Vàng' })).toBeDefined();
    expect(screen.getByText('Đã nộp')).toBeDefined();
  });

  it('hiển thị tên, email và MSSV của từng thành viên', async () => {
    renderAppAt('/teams/t-1');

    expect(await screen.findByText('Nguyễn Văn An')).toBeDefined();
    expect(screen.getByText('an@example.com')).toBeDefined();
    expect(screen.getByText('SV001')).toBeDefined();
    expect(screen.getByText('Trần Thị Bình')).toBeDefined();
  });

  it('hiện dấu gạch ngang cho thành viên không có MSSV', async () => {
    renderAppAt('/teams/t-1');

    const row = (await screen.findByText('Trần Thị Bình')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('—')).toBeDefined();
  });

  it('hiển thị lỗi cả trang khi không tải được thông tin nhóm', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getTeam.mockRejectedValue(new NotFoundError('Team', 't-1'));

    renderAppAt('/teams/t-1');

    expect(await screen.findByText('Không tìm thấy Team với id "t-1".')).toBeDefined();
  });
});

describe('FileViewer - nội dung bài làm (Requirement 5.4)', () => {
  it('render markdown đã format (tiêu đề thành heading thật)', async () => {
    renderAppAt('/teams/t-1');

    // `# Tiêu đề bài làm` phải thành <h1>, không phải chữ "# Tiêu đề".
    expect(await screen.findByRole('heading', { name: 'Tiêu đề bài làm' })).toBeDefined();
    expect(screen.getByText('Đoạn mô tả của nhóm.')).toBeDefined();
  });

  it('không render raw HTML trong markdown (Requirement 11.4)', async () => {
    getTeamFiles.mockResolvedValue({
      md: '<img src="x" onerror="window.__xss = true">\n\nvăn bản thường',
      xml: XML,
    });

    const { container } = renderAppAt('/teams/t-1');

    expect(await screen.findByText('văn bản thường')).toBeDefined();
    // `react-markdown` không bật `rehype-raw` -> thẻ HTML không thành element.
    expect(container.querySelector('img')).toBeNull();
  });

  it('hiển thị nội dung XML khi chuyển sang tab .xml', async () => {
    const user = userEvent.setup();
    renderAppAt('/teams/t-1');
    await screen.findByRole('heading', { name: 'Tiêu đề bài làm' });

    await user.click(screen.getByRole('tab', { name: 'Bài làm (.xml)' }));

    const xmlBlock = await screen.findByTestId('xml-content');
    expect(xmlBlock.textContent).toBe(XML);
  });

  it('hiện cảnh báo riêng khi nhóm chưa nộp đủ file, không làm sập trang', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getTeamFiles.mockRejectedValue(new ValidationError('Nhóm chưa nộp đủ 2 file.'));

    renderAppAt('/teams/t-1');

    expect(await screen.findByText('Nhóm chưa nộp đủ 2 file.')).toBeDefined();
    // Phần thông tin thành viên vẫn còn — đây là lý do tách lỗi theo từng khối.
    expect(screen.getByText('Nguyễn Văn An')).toBeDefined();
  });
});

describe('GradingHistoryList (Requirement 6.6)', () => {
  it('thông báo rõ khi nhóm chưa được chấm lần nào', async () => {
    renderAppAt('/teams/t-1');

    // Khoanh vùng trong khối lịch sử: `GradingPanel` (task 9.2) cũng hiển thị
    // lượt gần nhất với nhiều nhãn giống nhau, nên query toàn trang sẽ trùng.
    const history = await screen.findByTestId('grading-history');
    expect(within(history).getByText('Nhóm này chưa được chấm lần nào.')).toBeDefined();
  });

  it('hiển thị toàn bộ lượt chấm, đánh số theo thời gian và gắn nhãn lượt mới nhất', async () => {
    listGradingHistory.mockResolvedValue([
      makeGradingResult({
        gradingAttemptId: 'g-1',
        score: 60,
        gradedAt: '2024-09-02T10:00:00.000Z',
      }),
      makeGradingResult({
        gradingAttemptId: 'g-2',
        score: 75,
        gradedAt: '2024-09-03T10:00:00.000Z',
      }),
      makeGradingResult({
        gradingAttemptId: 'g-3',
        score: 90,
        gradedAt: '2024-09-04T10:00:00.000Z',
      }),
    ]);

    renderAppAt('/teams/t-1');

    // Giữ lại cả 3 lượt (Property 4: không ghi đè lịch sử).
    expect(await screen.findByText(/^Lượt 3 —/)).toBeDefined();
    expect(screen.getByText(/^Lượt 2 —/)).toBeDefined();
    expect(screen.getByText(/^Lượt 1 —/)).toBeDefined();
    expect(screen.getByText('Mới nhất')).toBeDefined();
  });

  it('hiển thị điểm AI và điểm sau review như 2 giá trị riêng (Requirement 7.5)', async () => {
    listGradingHistory.mockResolvedValue([
      makeGradingResult({
        gradingAttemptId: 'g-1',
        score: 65,
        finalScore: 80,
        needsReview: true,
        reviewStatus: 'REVIEWED',
        reviewedBy: 'admin',
      }),
    ]);

    renderAppAt('/teams/t-1');

    const history = within(await screen.findByTestId('grading-history'));
    expect(history.getByText('Điểm AI')).toBeDefined();
    expect(history.getByText('65')).toBeDefined();
    expect(history.getByText('Điểm sau review')).toBeDefined();
    expect(history.getByText('80')).toBeDefined();
    expect(history.getByText('Đã review')).toBeDefined();
  });

  it('hiển thị lý do lỗi của lượt chấm thất bại', async () => {
    listGradingHistory.mockResolvedValue([
      makeGradingResult({
        gradingAttemptId: 'g-1',
        status: 'FAILED',
        score: undefined,
        gradedAt: undefined,
        aiFeedback: undefined,
        errorMessage: 'AI Grader timeout: không nhận được phản hồi.',
      }),
    ]);

    renderAppAt('/teams/t-1');

    const history = within(await screen.findByTestId('grading-history'));
    expect(history.getByText('AI Grader timeout: không nhận được phản hồi.')).toBeDefined();
    expect(history.getByText('Lý do lỗi')).toBeDefined();
  });

  it('hiện cảnh báo riêng khi không đọc được lịch sử chấm', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    listGradingHistory.mockRejectedValue(new TypeError('Failed to fetch'));

    renderAppAt('/teams/t-1');

    expect(await screen.findByText('Không đọc được lịch sử chấm bài.')).toBeDefined();
    expect(screen.getByText('Nguyễn Văn An')).toBeDefined();
  });
});
