/**
 * Component test cho form nộp bài (task 5.7) — bao phủ task 5.5 và 5.6.
 *
 * Test đi qua `App` nên mỗi case là 1 lượt đi thật: cổng kiểm tra assignment
 * -> điền form -> validate client -> gọi lớp service -> điều hướng/ hiển thị
 * lỗi. Nhờ đó bắt được cả lỗi ghép nối (sai payload, điều hướng sai) chứ
 * không chỉ lỗi bên trong 1 component.
 *
 * Lớp service được mock: đây là test UI, còn việc `teamsApi` gọi đúng endpoint
 * và map lỗi HTTP sang typed error đã được kiểm ở `api-client` (task 4.3).
 *
 * _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.12_
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import {
  AssignmentClosedError,
  TeamNameConflictError,
  ValidationError,
} from '@quick-grading/shared-types';
import { assignmentsApi, teamsApi } from '../src/services';
import { MAX_FILE_SIZE_BYTES } from '../src/validation';
import { makeAssignment, makeFile, makeSubmissionFile, makeTeam } from './fixtures';
import { selectFiles } from './fileUploadTestUtils';
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
const createTeamAndSubmit = vi.mocked(teamsApi.createTeamAndSubmit);

const OPEN_ASSIGNMENT = makeAssignment({
  assignmentId: 'open-1',
  assignmentName: 'Đợt 1 - Lập trình Web - K21',
  status: 'OPEN',
});

beforeEach(() => {
  vi.clearAllMocks();
  listAssignments.mockResolvedValue([]);
  getAssignment.mockResolvedValue(OPEN_ASSIGNMENT);
  createTeamAndSubmit.mockResolvedValue({
    team: makeTeam({ teamName: 'Nhóm Rồng Vàng' }),
    files: [
      makeSubmissionFile({ fileType: 'md', fileName: 'bai-lam.md' }),
      makeSubmissionFile({ fileType: 'xml', fileName: 'bai-lam.xml' }),
    ],
    resubmitted: false,
  });
});

/** Mở form và chờ cổng kiểm tra assignment cho qua. */
async function openForm(): Promise<void> {
  renderAppAt('/submit/open-1');
  await screen.findByRole('button', { name: 'Nộp bài' });
}

/** Điền toàn bộ thông tin hợp lệ (1 thành viên + 2 file đúng loại). */
async function fillValidForm(user: UserEvent): Promise<void> {
  await user.type(screen.getByLabelText('Tên nhóm'), 'Nhóm Rồng Vàng');
  await user.type(screen.getByLabelText('Tên sinh viên của thành viên thứ 1'), 'Nguyễn Văn An');
  await user.type(screen.getByLabelText('Email của thành viên thứ 1'), 'an.nguyen@example.com');
  selectFiles('md', [makeFile('bai-lam.md')]);
  selectFiles('xml', [makeFile('bai-lam.xml')]);
}

function clickSubmit(user: UserEvent): Promise<void> {
  return user.click(screen.getByRole('button', { name: 'Nộp bài' }));
}

describe('Form nộp bài - cấu trúc form (Requirement 2.1, 2.5)', () => {
  it('hiển thị đủ tên nhóm, danh sách thành viên và 2 ô upload', async () => {
    await openForm();

    expect(screen.getByLabelText('Tên nhóm')).toBeDefined();
    expect(screen.getByLabelText('Tên sinh viên của thành viên thứ 1')).toBeDefined();
    expect(screen.getByLabelText('Email của thành viên thứ 1')).toBeDefined();
    expect(screen.getByLabelText('MSSV của thành viên thứ 1 (tuỳ chọn)')).toBeDefined();
    expect(screen.getByText('File bài làm (.md)')).toBeDefined();
    expect(screen.getByText('File bài làm (.xml)')).toBeDefined();
  });

  it('KHÔNG có trường "tên trường" (Requirement 2.5)', async () => {
    await openForm();

    expect(screen.queryByText(/tên trường/i)).toBeNull();
    expect(screen.queryByLabelText(/trường/i)).toBeNull();
  });
});

describe('Form nộp bài - danh sách thành viên (Requirement 2.3, 2.4)', () => {
  it('thêm được thành viên ngay trong form', async () => {
    const user = userEvent.setup();
    await openForm();

    await user.click(screen.getByRole('button', { name: '+ Thêm sinh viên' }));

    expect(screen.getByLabelText('Tên sinh viên của thành viên thứ 2')).toBeDefined();
  });

  it('xoá được thành viên vừa thêm', async () => {
    const user = userEvent.setup();
    await openForm();

    await user.click(screen.getByRole('button', { name: '+ Thêm sinh viên' }));
    await user.type(screen.getByLabelText('Tên sinh viên của thành viên thứ 2'), 'Trần Thị Bình');
    await user.click(screen.getByRole('button', { name: 'Xoá thành viên Trần Thị Bình' }));

    expect(screen.queryByLabelText('Tên sinh viên của thành viên thứ 2')).toBeNull();
  });
});

describe('Form nộp bài - chặn tại client trước khi gọi API (Requirement 2.9)', () => {
  it('không gọi API khi form còn trống, hiện lỗi từng ô', async () => {
    const user = userEvent.setup();
    await openForm();

    await clickSubmit(user);

    expect(createTeamAndSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Tên nhóm không được để trống.')).toBeDefined();
    expect(screen.getByText('Tên sinh viên không được để trống.')).toBeDefined();
    expect(screen.getByText('Email không được để trống.')).toBeDefined();
    expect(screen.getByText('Vui lòng chọn file .md.')).toBeDefined();
    expect(screen.getByText('Vui lòng chọn file .xml.')).toBeDefined();
  });

  it('không gọi API khi email thành viên sai định dạng', async () => {
    const user = userEvent.setup();
    await openForm();

    await user.type(screen.getByLabelText('Tên nhóm'), 'Nhóm A');
    await user.type(screen.getByLabelText('Tên sinh viên của thành viên thứ 1'), 'An');
    await user.type(screen.getByLabelText('Email của thành viên thứ 1'), 'khong-phai-email');
    selectFiles('md', [makeFile('bai-lam.md')]);
    selectFiles('xml', [makeFile('bai-lam.xml')]);

    await clickSubmit(user);

    expect(createTeamAndSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Email không đúng định dạng, ví dụ: ten@example.com')).toBeDefined();
  });

  it('không gọi API khi file sai loại (Requirement 2.7)', async () => {
    const user = userEvent.setup();
    await openForm();

    await fillValidForm(user);
    selectFiles('md', [makeFile('bai-lam.txt')]);

    await clickSubmit(user);

    expect(createTeamAndSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('File phải có phần mở rộng .md.')).toBeDefined();
  });

  it('không gọi API khi file vượt 5MB (Requirement 2.8)', async () => {
    const user = userEvent.setup();
    await openForm();

    await fillValidForm(user);
    selectFiles('xml', [makeFile('qua-lon.xml', MAX_FILE_SIZE_BYTES + 1)]);

    await clickSubmit(user);

    expect(createTeamAndSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('File nặng 5.0MB, vượt quá kích thước tối đa 5MB.')).toBeDefined();
  });
});

describe('Form nộp bài - nộp thành công (Requirement 2.9)', () => {
  it('gửi đúng payload lên lớp service', async () => {
    const user = userEvent.setup();
    await openForm();

    await fillValidForm(user);
    await user.type(screen.getByLabelText('MSSV của thành viên thứ 1 (tuỳ chọn)'), 'SV001');
    await clickSubmit(user);

    await waitFor(() => {
      expect(createTeamAndSubmit).toHaveBeenCalledTimes(1);
    });

    const payload = createTeamAndSubmit.mock.calls[0][0];
    expect(payload.assignmentId).toBe('open-1');
    expect(payload.teamName).toBe('Nhóm Rồng Vàng');
    expect(payload.members).toEqual([
      { memberName: 'Nguyễn Văn An', email: 'an.nguyen@example.com', studentCode: 'SV001' },
    ]);
    expect(payload.mdFile.name).toBe('bai-lam.md');
    expect(payload.xmlFile.name).toBe('bai-lam.xml');
  });

  it('bỏ MSSV khỏi payload khi để trống (Requirement 2.2)', async () => {
    const user = userEvent.setup();
    await openForm();

    await fillValidForm(user);
    await clickSubmit(user);

    await waitFor(() => {
      expect(createTeamAndSubmit).toHaveBeenCalledTimes(1);
    });
    expect(createTeamAndSubmit.mock.calls[0][0].members[0].studentCode).toBeUndefined();
  });

  it('cắt khoảng trắng dư ở tên nhóm trước khi gửi', async () => {
    const user = userEvent.setup();
    await openForm();

    await user.type(screen.getByLabelText('Tên nhóm'), '   Nhóm Rồng Vàng   ');
    await user.type(screen.getByLabelText('Tên sinh viên của thành viên thứ 1'), 'An');
    await user.type(screen.getByLabelText('Email của thành viên thứ 1'), 'an@example.com');
    selectFiles('md', [makeFile('bai-lam.md')]);
    selectFiles('xml', [makeFile('bai-lam.xml')]);
    await clickSubmit(user);

    await waitFor(() => {
      expect(createTeamAndSubmit).toHaveBeenCalledTimes(1);
    });
    expect(createTeamAndSubmit.mock.calls[0][0].teamName).toBe('Nhóm Rồng Vàng');
  });

  it('chuyển sang trang thông báo thành công với thông tin vừa nộp', async () => {
    const user = userEvent.setup();
    await openForm();

    await fillValidForm(user);
    await clickSubmit(user);

    // Requirement 2.9c
    expect(await screen.findByText('Đã nộp bài thành công')).toBeDefined();
    expect(screen.getByText(/Nhóm Rồng Vàng/)).toBeDefined();
    // Tên file do server trả về, để nhóm tự đối chiếu.
    expect(screen.getByText('bai-lam.md')).toBeDefined();
    expect(screen.getByText('bai-lam.xml')).toBeDefined();
  });
});

describe('Form nộp bài - thất bại (Requirement 2.10, 2.12)', () => {
  it('hiện thông báo trùng tên nhóm và KHÔNG sang trang thành công', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createTeamAndSubmit.mockRejectedValue(new TeamNameConflictError('Nhóm Rồng Vàng', 'open-1'));

    await openForm();
    await fillValidForm(user);
    await clickSubmit(user);

    // Requirement 2.12 — đúng câu nghiệp vụ yêu cầu.
    expect(
      await screen.findByText(
        'Nhóm "Nhóm Rồng Vàng" đã nộp bài, vui lòng liên hệ Admin nếu cần nộp lại.',
      ),
    ).toBeDefined();
    expect(screen.queryByText('Đã nộp bài thành công')).toBeNull();
    // Vẫn cho sửa tên nhóm rồi nộp lại.
    expect(screen.getByRole('button', { name: 'Nộp bài' }).hasAttribute('disabled')).toBe(false);
  });

  it('hiện thông báo đợt chấm đã đóng và vô hiệu nút nộp', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createTeamAndSubmit.mockRejectedValue(new AssignmentClosedError('open-1'));

    await openForm();
    await fillValidForm(user);
    await clickSubmit(user);

    expect(await screen.findByText('Đợt chấm này đã đóng, không thể nộp bài.')).toBeDefined();
    expect(screen.queryByText('Đã nộp bài thành công')).toBeNull();
    // Thử lại ngay cũng vô ích -> chặn nút nộp, mời chọn đợt khác.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Nộp bài' }).hasAttribute('disabled')).toBe(true);
    });
    expect(screen.getByRole('button', { name: 'Chọn đợt chấm khác' })).toBeDefined();
  });

  it('hiện nguyên văn lỗi validate của server', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createTeamAndSubmit.mockRejectedValue(
      new ValidationError('Thành viên thứ 1: email không đúng định dạng.'),
    );

    await openForm();
    await fillValidForm(user);
    await clickSubmit(user);

    expect(await screen.findByText('Thành viên thứ 1: email không đúng định dạng.')).toBeDefined();
    expect(screen.queryByText('Đã nộp bài thành công')).toBeNull();
  });

  it('lỗi hệ thống: nói rõ bài CHƯA được ghi nhận, không lộ lỗi kỹ thuật', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createTeamAndSubmit.mockRejectedValue(new TypeError('Failed to fetch'));

    await openForm();
    await fillValidForm(user);
    await clickSubmit(user);

    // Requirement 2.10
    expect(
      await screen.findByText(
        'Đã xảy ra lỗi hệ thống khi ghi nhận bài nộp. Bài của nhóm CHƯA được ghi nhận, vui lòng thử lại.',
      ),
    ).toBeDefined();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
    expect(screen.queryByText('Đã nộp bài thành công')).toBeNull();
  });

  it('giữ nguyên dữ liệu đã nhập sau khi nộp thất bại', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createTeamAndSubmit.mockRejectedValue(new TeamNameConflictError('Nhóm Rồng Vàng', 'open-1'));

    await openForm();
    await fillValidForm(user);
    await clickSubmit(user);
    await screen.findByText(/đã nộp bài, vui lòng liên hệ Admin/);

    // Người dùng không phải điền lại từ đầu chỉ vì đổi tên nhóm.
    expect((screen.getByLabelText('Tên nhóm') as HTMLInputElement).value).toBe('Nhóm Rồng Vàng');
    expect((screen.getByLabelText('Email của thành viên thứ 1') as HTMLInputElement).value).toBe(
      'an.nguyen@example.com',
    );
  });
});

describe('Form nộp bài - nộp lại sau khi được mở khoá (Requirement 2.14)', () => {
  it('hướng dẫn nhập lại tên nhóm cũ để nộp lại', async () => {
    await openForm();

    // Đây là đường DUY NHẤT để nhóm đã được mở khoá nộp bản mới, nên không
    // hướng dẫn thì không ai đoán được.
    expect(
      screen.getByText(/đã được giảng viên mở khoá nộp lại.*nhập đúng tên nhóm cũ/),
    ).toBeDefined();
  });

  it('hiển thị "Đã nộp lại bài thành công" khi server báo đây là lần nộp lại', async () => {
    const user = userEvent.setup();
    createTeamAndSubmit.mockResolvedValue({
      team: makeTeam({ teamName: 'Nhóm Rồng Vàng' }),
      files: [
        makeSubmissionFile({ fileType: 'md', fileName: 'bai-lam-v2.md' }),
        makeSubmissionFile({ fileType: 'xml', fileName: 'bai-lam-v2.xml' }),
      ],
      // Server quyết định; client không tự suy đoán được.
      resubmitted: true,
    });

    await openForm();
    await fillValidForm(user);
    await clickSubmit(user);

    expect(await screen.findByText('Đã nộp lại bài thành công')).toBeDefined();
    expect(screen.getByText(/thay thế bản nộp trước đó/)).toBeDefined();
    // Không được hiện câu của lần nộp đầu.
    expect(screen.queryByText('Đã nộp bài thành công')).toBeNull();
  });

  it('vẫn hiển thị "Đã nộp bài thành công" cho lần nộp đầu', async () => {
    const user = userEvent.setup();
    await openForm();
    await fillValidForm(user);
    await clickSubmit(user);

    expect(await screen.findByText('Đã nộp bài thành công')).toBeDefined();
    expect(screen.queryByText('Đã nộp lại bài thành công')).toBeNull();
  });
});
