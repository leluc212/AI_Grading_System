/**
 * Test trang cấu hình rubric (task 10.1).
 *
 * _Requirements: 9.1, 9.2, 9.3, 9.4_
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Rubric } from '@quick-grading/shared-types';
import { ValidationError } from '@quick-grading/shared-types';
import { authApi, rubricsApi } from '../src/services';
import { renderAppAt, seedAdminSession } from './renderApp';

vi.mock('../src/services', async () => (await import('./servicesMock')).createServicesMock());

const getActiveRubric = vi.mocked(rubricsApi.getActiveRubric);
const listRubricVersions = vi.mocked(rubricsApi.listRubricVersions);
const saveRubric = vi.mocked(rubricsApi.saveRubric);

function makeRubric(overrides: Partial<Rubric> = {}): Rubric {
  return {
    rubricId: 'r-1',
    version: 1,
    criteria: [
      { id: 'c1', label: 'Tính đúng đắn', weight: 60 },
      { id: 'c2', label: 'Chất lượng trình bày', weight: 40 },
    ],
    isActive: true,
    createdAt: '2024-09-01T08:00:00.000Z',
    updatedAt: '2024-09-01T08:00:00.000Z',
    ...overrides,
  };
}

const ACTIVE_V2 = makeRubric({
  rubricId: 'r-2',
  version: 2,
  isActive: true,
  criteria: [{ id: 'c1', label: 'Tính đúng đắn', weight: 100 }],
});
const OLD_V1 = makeRubric({ rubricId: 'r-1', version: 1, isActive: false });

beforeEach(() => {
  vi.clearAllMocks();
  seedAdminSession('admin');
  vi.mocked(authApi.getCurrentAdmin).mockReturnValue({ username: 'admin' });
  getActiveRubric.mockResolvedValue(makeRubric());
  listRubricVersions.mockResolvedValue([makeRubric()]);
});

/** Mở trang và chờ tải xong. */
async function openPage(): Promise<void> {
  renderAppAt('/rubric');
  await screen.findByRole('heading', { level: 2, name: 'Tiêu chí chấm điểm' });
}

describe('RubricConfigPage - nạp rubric đang dùng', () => {
  it('nạp tiêu chí của phiên bản đang active vào form', async () => {
    await openPage();

    expect((screen.getByLabelText('Tên tiêu chí thứ 1') as HTMLInputElement).value).toBe(
      'Tính đúng đắn',
    );
    expect(
      (screen.getByLabelText('Trọng số của tiêu chí thứ 1 (tuỳ chọn)') as HTMLInputElement).value,
    ).toBe('60');
    expect((screen.getByLabelText('Tên tiêu chí thứ 2') as HTMLInputElement).value).toBe(
      'Chất lượng trình bày',
    );
  });

  it('nói rõ đang dùng phiên bản nào và việc lưu sẽ tạo phiên bản mới', async () => {
    await openPage();

    expect(screen.getByText(/Đang dùng phiên bản 1.*tạo một phiên bản mới/)).toBeDefined();
  });

  it('mở sẵn 1 dòng trống khi chưa có rubric nào', async () => {
    getActiveRubric.mockResolvedValue(null);
    listRubricVersions.mockResolvedValue([]);

    await openPage();

    expect((screen.getByLabelText('Tên tiêu chí thứ 1') as HTMLInputElement).value).toBe('');
    expect(
      screen.getByText(/Chưa có rubric nào. Lần lưu đầu tiên sẽ tạo phiên bản 1./),
    ).toBeDefined();
  });

  it('hiển thị lỗi kèm nút thử lại khi không tải được', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getActiveRubric.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    renderAppAt('/rubric');

    expect(
      await screen.findByText('Không tải được cấu hình rubric. Vui lòng thử lại.'),
    ).toBeDefined();
    expect(screen.queryByText('Failed to fetch')).toBeNull();

    getActiveRubric.mockResolvedValue(makeRubric());
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: 'Tiêu chí chấm điểm' }),
    ).toBeDefined();
  });
});

describe('RubricConfigPage - sửa tiêu chí (Requirement 9.1)', () => {
  it('thêm được tiêu chí mới', async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(screen.getByRole('button', { name: '+ Thêm tiêu chí' }));

    expect(screen.getByLabelText('Tên tiêu chí thứ 3')).toBeDefined();
  });

  it('xoá được tiêu chí', async () => {
    const user = userEvent.setup();
    await openPage();

    await user.click(screen.getByRole('button', { name: 'Xoá tiêu chí Chất lượng trình bày' }));

    expect(screen.queryByLabelText('Tên tiêu chí thứ 2')).toBeNull();
  });

  it('không cho xoá khi chỉ còn 1 tiêu chí', async () => {
    getActiveRubric.mockResolvedValue(
      makeRubric({ criteria: [{ id: 'c1', label: 'Tiêu chí duy nhất', weight: 100 }] }),
    );
    await openPage();

    // `isItemRemovable` trả false -> Cloudscape ẩn hẳn nút xoá.
    expect(screen.queryByRole('button', { name: /^Xoá tiêu chí/ })).toBeNull();
  });

  it('hiện tổng trọng số và cảnh báo khi tổng khác 100', async () => {
    const user = userEvent.setup();
    await openPage();

    // 60 + 40 = 100 -> chưa cảnh báo.
    expect(screen.queryByText(/khác 100/)).toBeNull();

    const weightInput = screen.getByLabelText('Trọng số của tiêu chí thứ 2 (tuỳ chọn)');
    await user.clear(weightInput);
    await user.type(weightInput, '30');

    expect(await screen.findByText(/Tổng trọng số hiện tại là 90, khác 100/)).toBeDefined();
    // Cảnh báo thôi, không chặn lưu.
    expect(screen.getByRole('button', { name: 'Lưu phiên bản mới' }).hasAttribute('disabled')).toBe(
      false,
    );
  });
});

describe('RubricConfigPage - lưu phiên bản mới (Requirement 9.2)', () => {
  it('không gọi API khi tên tiêu chí để trống', async () => {
    const user = userEvent.setup();
    await openPage();

    await user.clear(screen.getByLabelText('Tên tiêu chí thứ 1'));
    await user.click(screen.getByRole('button', { name: 'Lưu phiên bản mới' }));

    expect(saveRubric).not.toHaveBeenCalled();
    expect(screen.getByText('Tên tiêu chí không được để trống.')).toBeDefined();
  });

  it('không gọi API khi trọng số ngoài khoảng 0 - 100', async () => {
    const user = userEvent.setup();
    await openPage();

    const weightInput = screen.getByLabelText('Trọng số của tiêu chí thứ 1 (tuỳ chọn)');
    await user.clear(weightInput);
    await user.type(weightInput, '150');
    await user.click(screen.getByRole('button', { name: 'Lưu phiên bản mới' }));

    expect(saveRubric).not.toHaveBeenCalled();
    expect(screen.getByText('Trọng số phải nằm trong khoảng 0 - 100.')).toBeDefined();
  });

  it('ô trọng số không nhận được ký tự chữ (type="number")', async () => {
    const user = userEvent.setup();
    saveRubric.mockResolvedValue(makeRubric({ version: 2 }));
    await openPage();

    const weightInput = screen.getByLabelText(
      'Trọng số của tiêu chí thứ 1 (tuỳ chọn)',
    ) as HTMLInputElement;
    await user.clear(weightInput);
    await user.type(weightInput, 'abc');

    // `<input type="number">` không cho gõ chữ, nên ô trở thành rỗng — tức là
    // "không đặt trọng số", hợp lệ. Nhánh "trọng số phải là một số" trong
    // `validateCriterion` vì vậy là phòng vệ chiều sâu (ví dụ dán giá trị, hoặc
    // sau này đổi kiểu input), được kiểm ở `rubricDraft.test.ts`.
    expect(weightInput.value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Lưu phiên bản mới' }));

    await waitFor(() => {
      expect(saveRubric).toHaveBeenCalledWith({
        criteria: [
          { id: 'c1', label: 'Tính đúng đắn' },
          { id: 'c2', label: 'Chất lượng trình bày', weight: 40 },
        ],
      });
    });
  });

  it('gửi payload đúng và giữ nguyên id của tiêu chí cũ', async () => {
    const user = userEvent.setup();
    saveRubric.mockResolvedValue(makeRubric({ version: 2 }));
    await openPage();

    await user.clear(screen.getByLabelText('Tên tiêu chí thứ 1'));
    await user.type(screen.getByLabelText('Tên tiêu chí thứ 1'), 'Tính đúng đắn (sửa)');
    await user.click(screen.getByRole('button', { name: 'Lưu phiên bản mới' }));

    await waitFor(() => {
      expect(saveRubric).toHaveBeenCalledWith({
        criteria: [
          { id: 'c1', label: 'Tính đúng đắn (sửa)', weight: 60 },
          { id: 'c2', label: 'Chất lượng trình bày', weight: 40 },
        ],
      });
    });
  });

  it('thông báo số phiên bản mới và tải lại danh sách', async () => {
    const user = userEvent.setup();
    saveRubric.mockResolvedValue(makeRubric({ version: 3 }));
    await openPage();

    await user.click(screen.getByRole('button', { name: 'Lưu phiên bản mới' }));

    expect(await screen.findByText(/Đã lưu rubric phiên bản 3/)).toBeDefined();
    // Tải lại để cờ "Đang dùng" và danh sách phiên bản khớp server.
    await waitFor(() => {
      expect(listRubricVersions).toHaveBeenCalledTimes(2);
    });
  });

  it('hiển thị lỗi validate của server', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    saveRubric.mockRejectedValue(new ValidationError('criteria phải là một mảng không rỗng.'));
    await openPage();

    await user.click(screen.getByRole('button', { name: 'Lưu phiên bản mới' }));

    expect(await screen.findByText('criteria phải là một mảng không rỗng.')).toBeDefined();
  });

  it('"Hoàn tác thay đổi" nạp lại tiêu chí từ server', async () => {
    const user = userEvent.setup();
    await openPage();

    await user.clear(screen.getByLabelText('Tên tiêu chí thứ 1'));
    await user.type(screen.getByLabelText('Tên tiêu chí thứ 1'), 'Gõ dở rồi hoàn tác');
    await user.click(screen.getByRole('button', { name: 'Hoàn tác thay đổi' }));

    await waitFor(() => {
      expect((screen.getByLabelText('Tên tiêu chí thứ 1') as HTMLInputElement).value).toBe(
        'Tính đúng đắn',
      );
    });
  });
});

describe('RubricVersionHistory (Requirement 9.2, 9.3, 9.4)', () => {
  it('liệt kê toàn bộ phiên bản, mới nhất trước', async () => {
    listRubricVersions.mockResolvedValue([OLD_V1, ACTIVE_V2]);
    getActiveRubric.mockResolvedValue(ACTIVE_V2);

    await openPage();

    const history = within(screen.getByTestId('rubric-versions'));
    expect(history.getByText(/^Phiên bản 2 —/)).toBeDefined();
    // Requirement 9.2: bản cũ không bị xoá.
    expect(history.getByText(/^Phiên bản 1 —/)).toBeDefined();
  });

  it('đánh dấu phiên bản đang dùng (Requirement 9.4)', async () => {
    listRubricVersions.mockResolvedValue([OLD_V1, ACTIVE_V2]);
    getActiveRubric.mockResolvedValue(ACTIVE_V2);

    await openPage();

    const history = within(screen.getByTestId('rubric-versions'));
    expect(history.getAllByText('Đang dùng')).toHaveLength(1);
  });

  it('hiển thị tiêu chí của phiên bản cũ để tra cứu (Requirement 9.3)', async () => {
    listRubricVersions.mockResolvedValue([ACTIVE_V2]);
    getActiveRubric.mockResolvedValue(ACTIVE_V2);

    await openPage();

    const history = within(screen.getByTestId('rubric-versions'));
    expect(history.getByText('Tính đúng đắn')).toBeDefined();
    expect(history.getByText('100')).toBeDefined();
  });

  it('không có đường sửa phiên bản cũ', async () => {
    listRubricVersions.mockResolvedValue([OLD_V1, ACTIVE_V2]);
    getActiveRubric.mockResolvedValue(ACTIVE_V2);

    await openPage();

    // Sửa bản cũ sẽ làm sai lệch ý nghĩa `rubricVersion` đã ghi ở lượt chấm cũ.
    const history = within(screen.getByTestId('rubric-versions'));
    expect(history.queryByRole('button', { name: /Sửa/ })).toBeNull();
    expect(history.queryByRole('textbox')).toBeNull();
  });

  it('thông báo rõ khi chưa có phiên bản nào', async () => {
    getActiveRubric.mockResolvedValue(null);
    listRubricVersions.mockResolvedValue([]);

    await openPage();

    expect(screen.getByText('Chưa có phiên bản rubric nào được lưu.')).toBeDefined();
  });
});
