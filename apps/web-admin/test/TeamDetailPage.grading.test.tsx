/**
 * Test luồng chấm bài, review và mở khoá nộp lại trên trang chi tiết nhóm
 * (task 9.1, 9.2, 9.3, 9.4).
 *
 * Test đi qua `App` nên mỗi case là đường thật: trang gọi lớp service, nhận
 * kết quả, rồi cập nhật UI. Phần poll (lượt chấm hoàn tất out-of-band) được
 * kiểm bằng fake timers vì nếu chờ thật thì mỗi case tốn vài giây.
 *
 * _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 7.1, 7.3, 7.4, 7.5, 8.1, 8.2_
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GradingInProgressError, ValidationError } from '@quick-grading/shared-types';
import { authApi, gradingApi, teamsApi } from '../src/services';
import { makeGradingResult, makeTeam } from './fixtures';
import { renderAppAt, seedAdminSession } from './renderApp';

vi.mock('../src/services', async () => (await import('./servicesMock')).createServicesMock());

const getTeam = vi.mocked(teamsApi.getTeam);
const getTeamFiles = vi.mocked(teamsApi.getTeamFiles);
const unlockResubmission = vi.mocked(teamsApi.unlockResubmission);
const listGradingHistory = vi.mocked(gradingApi.listGradingHistory);
const triggerGrading = vi.mocked(gradingApi.triggerGrading);
const submitReview = vi.mocked(gradingApi.submitReview);

const SUBMITTED_TEAM = makeTeam({ teamId: 't-1', teamName: 'Nhóm Rồng Vàng', status: 'SUBMITTED' });

beforeEach(() => {
  vi.clearAllMocks();
  seedAdminSession('admin');
  vi.mocked(authApi.getCurrentAdmin).mockReturnValue({ username: 'admin' });
  getTeam.mockResolvedValue(SUBMITTED_TEAM);
  getTeamFiles.mockResolvedValue({ md: '# bài làm', xml: '<root/>' });
  listGradingHistory.mockResolvedValue([]);
});

/** Chờ trang chi tiết nhóm tải xong. */
async function openTeamPage(): Promise<void> {
  renderAppAt('/teams/t-1');
  await screen.findByRole('heading', { level: 1, name: 'Nhóm Rồng Vàng' });
}

describe('GradingPanel - trigger chấm bài (Requirement 6.1, 6.2, 6.3)', () => {
  it('không tự chấm khi mở trang — chỉ chấm khi Admin bấm (Requirement 6.1)', async () => {
    await openTeamPage();

    expect(triggerGrading).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Chấm bài' })).toBeDefined();
  });

  it('gọi triggerGrading với teamId và tên Admin đang đăng nhập', async () => {
    const user = userEvent.setup();
    triggerGrading.mockResolvedValue(
      makeGradingResult({ status: 'IN_PROGRESS', score: undefined }),
    );
    await openTeamPage();

    await user.click(screen.getByRole('button', { name: 'Chấm bài' }));

    await waitFor(() => {
      expect(triggerGrading).toHaveBeenCalledWith('t-1', 'admin');
    });
  });

  it('vô hiệu nút khi nhóm chưa nộp bài (Requirement 6.2)', async () => {
    getTeam.mockResolvedValue(
      makeTeam({ teamId: 't-1', teamName: 'Nhóm Chưa Nộp', status: 'OPEN' }),
    );
    getTeamFiles.mockRejectedValue(new ValidationError('Nhóm chưa nộp đủ 2 file.'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderAppAt('/teams/t-1');
    await screen.findByRole('heading', { level: 1, name: 'Nhóm Chưa Nộp' });

    expect(screen.getByRole('button', { name: 'Chấm bài' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Nhóm chưa nộp đủ 2 file nên chưa thể chấm bài/)).toBeDefined();
  });

  it('vô hiệu nút khi đang có lượt chấm chạy (Requirement 6.3)', async () => {
    listGradingHistory.mockResolvedValue([
      makeGradingResult({ status: 'IN_PROGRESS', score: undefined, gradedAt: undefined }),
    ]);

    await openTeamPage();

    expect(screen.getByRole('button', { name: 'Chấm lại' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Đang chấm bài, kết quả sẽ tự cập nhật/)).toBeDefined();
  });

  it('hiển thị lỗi khi server chặn vì đang chấm (Requirement 6.3)', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    triggerGrading.mockRejectedValue(new GradingInProgressError('t-1'));
    await openTeamPage();

    await user.click(screen.getByRole('button', { name: 'Chấm bài' }));

    expect(
      await screen.findByText('Nhóm này đang được chấm bài, vui lòng thử lại sau.'),
    ).toBeDefined();
  });

  it('hiển thị câu fallback khi lỗi mạng, không lộ chi tiết kỹ thuật', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    triggerGrading.mockRejectedValue(new TypeError('Failed to fetch'));
    await openTeamPage();

    await user.click(screen.getByRole('button', { name: 'Chấm bài' }));

    expect(
      await screen.findByText('Không bắt đầu được lượt chấm. Vui lòng thử lại.'),
    ).toBeDefined();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
  });
});

describe('GradingPanel - hiển thị kết quả (Requirement 6.4, 6.5)', () => {
  it('hiện điểm, nhận xét AI và thời điểm chấm khi hoàn tất', async () => {
    listGradingHistory.mockResolvedValue([
      makeGradingResult({ score: 88, aiFeedback: 'Cấu trúc file rõ ràng.', rubricVersion: 2 }),
    ]);

    await openTeamPage();

    expect(screen.getByText('Điểm cuối')).toBeDefined();
    expect(screen.getAllByText('88').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cấu trúc file rõ ràng.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('v2').length).toBeGreaterThan(0);
  });

  it('ưu tiên finalScore làm điểm cuối (Requirement 7.6)', async () => {
    listGradingHistory.mockResolvedValue([
      makeGradingResult({
        score: 65,
        finalScore: 80,
        reviewStatus: 'REVIEWED',
        reviewedBy: 'admin',
      }),
    ]);

    await openTeamPage();

    // Điểm cuối = 80 (finalScore), điểm AI gốc 65 vẫn được hiện riêng.
    expect(screen.getAllByText('80').length).toBeGreaterThan(0);
    expect(screen.getAllByText('65').length).toBeGreaterThan(0);
  });

  it('hiện lý do lỗi kèm nút "Chấm lại" khi lượt chấm FAILED (Requirement 6.5)', async () => {
    listGradingHistory.mockResolvedValue([
      makeGradingResult({
        status: 'FAILED',
        score: undefined,
        gradedAt: undefined,
        aiFeedback: undefined,
        errorMessage: 'AI Grader timeout: không nhận được phản hồi.',
      }),
    ]);

    await openTeamPage();

    expect(screen.getByText('Lượt chấm gần nhất thất bại')).toBeDefined();
    expect(
      screen.getAllByText('AI Grader timeout: không nhận được phản hồi.').length,
    ).toBeGreaterThan(0);
    const retry = screen.getByRole('button', { name: 'Chấm lại' });
    expect(retry.hasAttribute('disabled')).toBe(false);
  });
});

describe('GradingPanel - tự cập nhật khi lượt chấm hoàn tất', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('poll lịch sử chấm cho tới khi có kết quả', async () => {
    vi.useFakeTimers();

    // CỐ TÌNH không dùng `userEvent` ở test này: kết hợp `userEvent` với fake
    // timers làm test treo (userEvent chờ timer thật giữa các event, còn timer
    // thì đã bị giả lập). Mở trang sẵn ở trạng thái `IN_PROGRESS` là đủ để
    // kiểm vòng poll — đường "bấm nút -> IN_PROGRESS" đã có test riêng ở trên.
    const inProgress = makeGradingResult({
      gradingAttemptId: 'g-1',
      status: 'IN_PROGRESS',
      score: undefined,
      gradedAt: undefined,
      aiFeedback: undefined,
    });
    const graded = makeGradingResult({ gradingAttemptId: 'g-1', score: 92 });

    // Lần tải đầu: đang chấm. Các lần poll sau: đã có kết quả.
    listGradingHistory.mockResolvedValueOnce([inProgress]).mockResolvedValue([graded]);

    renderAppAt('/teams/t-1');
    await vi.waitFor(() => {
      expect(screen.getByText(/Đang chấm bài/)).toBeDefined();
    });

    // Vòng poll chạy mỗi 1.5s.
    await vi.advanceTimersByTimeAsync(1600);

    await vi.waitFor(() => {
      expect(screen.getAllByText('92').length).toBeGreaterThan(0);
    });
    // Poll phải DỪNG khi đã có kết quả, không chạy mãi.
    expect(screen.queryByText(/Đang chấm bài/)).toBeNull();
    const callsAfterResult = listGradingHistory.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1500 * 3);
    expect(listGradingHistory.mock.calls.length).toBe(callsAfterResult);
  });

  it('ngừng poll và thông báo khi lượt chấm chạy quá lâu', async () => {
    vi.useFakeTimers();
    // Luôn trả IN_PROGRESS -> mô phỏng lượt chấm bị treo.
    listGradingHistory.mockResolvedValue([
      makeGradingResult({ status: 'IN_PROGRESS', score: undefined, gradedAt: undefined }),
    ]);

    renderAppAt('/teams/t-1');
    await vi.waitFor(() => {
      expect(screen.getByText(/Đang chấm bài/)).toBeDefined();
    });

    // 20 lần poll * 1.5s = 30s, thêm 1 nhịp nữa để vượt ngưỡng.
    await vi.advanceTimersByTimeAsync(1500 * 22);

    await vi.waitFor(() => {
      expect(screen.getByText(/trang đã ngừng tự cập nhật/)).toBeDefined();
    });
    // Không gọi API vô hạn: số lần gọi bị chặn ở ngưỡng (1 lần tải đầu + tối đa 20 lần poll).
    expect(listGradingHistory.mock.calls.length).toBeLessThanOrEqual(21);
  });
});

describe('ReviewPanel (Requirement 7.1, 7.3, 7.4, 7.5)', () => {
  const NEEDS_REVIEW = makeGradingResult({
    gradingAttemptId: 'g-review',
    score: 62,
    aiFeedback: 'Thiếu phần phân tích yêu cầu.',
    needsReview: true,
    reviewStatus: 'PENDING_REVIEW',
  });

  it('không hiện khu vực review khi lượt chấm không cần review', async () => {
    listGradingHistory.mockResolvedValue([makeGradingResult({ needsReview: false })]);

    await openTeamPage();

    expect(screen.queryByRole('heading', { level: 2, name: 'Cần review' })).toBeNull();
  });

  it('hiện khu vực review kèm điểm và nhận xét AI (Requirement 7.1, 7.2)', async () => {
    listGradingHistory.mockResolvedValue([NEEDS_REVIEW]);

    await openTeamPage();

    expect(screen.getByRole('heading', { level: 2, name: 'Cần review' })).toBeDefined();
    expect(screen.getByText('Điểm AI đề xuất')).toBeDefined();
    expect(screen.getAllByText('Thiếu phần phân tích yêu cầu.').length).toBeGreaterThan(0);
    // Requirement 7.2: nội dung file hiển thị cùng lúc trên chính trang này.
    expect(screen.getByRole('heading', { name: 'bài làm' })).toBeDefined();
  });

  it('không hiện nữa sau khi đã review xong', async () => {
    listGradingHistory.mockResolvedValue([
      makeGradingResult({ needsReview: true, reviewStatus: 'REVIEWED', reviewedBy: 'admin' }),
    ]);

    await openTeamPage();

    expect(screen.queryByRole('heading', { level: 2, name: 'Cần review' })).toBeNull();
  });

  it('giữ nguyên điểm AI: KHÔNG gửi finalScore (Requirement 7.3, 7.5)', async () => {
    const user = userEvent.setup();
    listGradingHistory.mockResolvedValue([NEEDS_REVIEW]);
    submitReview.mockResolvedValue({ ...NEEDS_REVIEW, reviewStatus: 'REVIEWED' });

    await openTeamPage();
    await user.click(screen.getByRole('button', { name: 'Lưu review' }));

    await waitFor(() => {
      expect(submitReview).toHaveBeenCalledWith('t-1', 'g-review', { reviewedBy: 'admin' });
    });
    // Không có `finalScore` trong payload -> server không chạm tới `score` gốc.
    expect(submitReview.mock.calls[0][2]).not.toHaveProperty('finalScore');
  });

  it('sửa điểm: gửi finalScore riêng, không đụng score gốc (Requirement 7.4, 7.5)', async () => {
    const user = userEvent.setup();
    listGradingHistory.mockResolvedValue([NEEDS_REVIEW]);
    submitReview.mockResolvedValue({ ...NEEDS_REVIEW, finalScore: 75, reviewStatus: 'REVIEWED' });

    await openTeamPage();
    await user.click(screen.getByRole('radio', { name: /Sửa điểm/ }));
    await user.type(screen.getByLabelText('Điểm cuối cùng'), '75');
    await user.click(screen.getByRole('button', { name: 'Lưu review' }));

    await waitFor(() => {
      expect(submitReview).toHaveBeenCalledWith('t-1', 'g-review', {
        reviewedBy: 'admin',
        finalScore: 75,
      });
    });
  });

  it('không gọi API khi chọn sửa điểm mà để trống', async () => {
    const user = userEvent.setup();
    listGradingHistory.mockResolvedValue([NEEDS_REVIEW]);

    await openTeamPage();
    await user.click(screen.getByRole('radio', { name: /Sửa điểm/ }));
    await user.click(screen.getByRole('button', { name: 'Lưu review' }));

    expect(submitReview).not.toHaveBeenCalled();
    expect(screen.getByText('Vui lòng nhập điểm mới.')).toBeDefined();
  });

  it('từ chối điểm ngoài khoảng 0 - 100', async () => {
    const user = userEvent.setup();
    listGradingHistory.mockResolvedValue([NEEDS_REVIEW]);

    await openTeamPage();
    await user.click(screen.getByRole('radio', { name: /Sửa điểm/ }));
    await user.type(screen.getByLabelText('Điểm cuối cùng'), '150');
    await user.click(screen.getByRole('button', { name: 'Lưu review' }));

    expect(submitReview).not.toHaveBeenCalled();
    expect(screen.getByText('Điểm phải nằm trong khoảng 0 - 100.')).toBeDefined();
  });

  it('chấp nhận điểm 0 (không coi là để trống)', async () => {
    const user = userEvent.setup();
    listGradingHistory.mockResolvedValue([NEEDS_REVIEW]);
    submitReview.mockResolvedValue({ ...NEEDS_REVIEW, finalScore: 0, reviewStatus: 'REVIEWED' });

    await openTeamPage();
    await user.click(screen.getByRole('radio', { name: /Sửa điểm/ }));
    await user.type(screen.getByLabelText('Điểm cuối cùng'), '0');
    await user.click(screen.getByRole('button', { name: 'Lưu review' }));

    await waitFor(() => {
      expect(submitReview).toHaveBeenCalledWith('t-1', 'g-review', {
        reviewedBy: 'admin',
        finalScore: 0,
      });
    });
  });

  it('hiển thị lỗi khi lưu review thất bại', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    listGradingHistory.mockResolvedValue([NEEDS_REVIEW]);
    submitReview.mockRejectedValue(new TypeError('Failed to fetch'));

    await openTeamPage();
    await user.click(screen.getByRole('button', { name: 'Lưu review' }));

    expect(
      await screen.findByText('Không lưu được kết quả review. Vui lòng thử lại.'),
    ).toBeDefined();
  });

  it('tải lại lịch sử chấm sau khi review thành công', async () => {
    const user = userEvent.setup();
    listGradingHistory.mockResolvedValue([NEEDS_REVIEW]);
    submitReview.mockResolvedValue({ ...NEEDS_REVIEW, reviewStatus: 'REVIEWED' });

    await openTeamPage();
    const callsBefore = listGradingHistory.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Lưu review' }));

    await waitFor(() => {
      expect(listGradingHistory.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

describe('Mở khoá nộp lại (Requirement 8.1, 8.2)', () => {
  it('chỉ hiện nút khi nhóm đang ở trạng thái đã nộp', async () => {
    await openTeamPage();

    expect(screen.getByRole('button', { name: 'Mở khoá nộp lại' })).toBeDefined();
  });

  it('không hiện nút khi nhóm chưa nộp bài', async () => {
    getTeam.mockResolvedValue(
      makeTeam({ teamId: 't-1', teamName: 'Nhóm Chưa Nộp', status: 'OPEN' }),
    );
    getTeamFiles.mockRejectedValue(new ValidationError('Nhóm chưa nộp đủ 2 file.'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderAppAt('/teams/t-1');
    await screen.findByRole('heading', { level: 1, name: 'Nhóm Chưa Nộp' });

    expect(screen.queryByRole('button', { name: 'Mở khoá nộp lại' })).toBeNull();
  });

  it('không hiện nút khi nhóm đã được mở khoá rồi', async () => {
    getTeam.mockResolvedValue(
      makeTeam({ teamId: 't-1', teamName: 'Nhóm Sao Băng', status: 'RESUBMISSION_ALLOWED' }),
    );

    renderAppAt('/teams/t-1');
    await screen.findByRole('heading', { level: 1, name: 'Nhóm Sao Băng' });

    expect(screen.queryByRole('button', { name: 'Mở khoá nộp lại' })).toBeNull();
    expect(screen.getByText('Được nộp lại')).toBeDefined();
  });

  it('gọi API với tên Admin và cập nhật trạng thái nhóm ngay', async () => {
    const user = userEvent.setup();
    unlockResubmission.mockResolvedValue({ ...SUBMITTED_TEAM, status: 'RESUBMISSION_ALLOWED' });

    await openTeamPage();
    await user.click(screen.getByRole('button', { name: 'Mở khoá nộp lại' }));

    await waitFor(() => {
      expect(unlockResubmission).toHaveBeenCalledWith('t-1', 'admin');
    });
    expect(await screen.findByText(/Đã mở khoá nộp lại/)).toBeDefined();
    // Trạng thái đổi ngay từ response, nút mở khoá biến mất.
    expect(screen.getByText('Được nộp lại')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Mở khoá nộp lại' })).toBeNull();
  });

  it('hiển thị lỗi của server khi không mở khoá được', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    unlockResubmission.mockRejectedValue(
      new ValidationError(
        'Chỉ có thể mở khoá nộp lại cho nhóm đang ở trạng thái SUBMITTED (nhóm hiện tại: OPEN).',
      ),
    );

    await openTeamPage();
    await user.click(screen.getByRole('button', { name: 'Mở khoá nộp lại' }));

    expect(
      await screen.findByText(
        'Chỉ có thể mở khoá nộp lại cho nhóm đang ở trạng thái SUBMITTED (nhóm hiện tại: OPEN).',
      ),
    ).toBeDefined();
  });
});
