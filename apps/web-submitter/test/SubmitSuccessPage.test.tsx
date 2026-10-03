/**
 * Test trang thông báo nộp bài thành công (task 5.6).
 *
 * Trọng tâm là mặt phòng vệ của Requirement 2.10: trang này KHÔNG được nói
 * "thành công" khi không có bằng chứng nào cho thấy bài đã được ghi nhận —
 * tức là khi `location.state` thiếu hoặc không đúng shape (vào thẳng URL,
 * bookmark, hoặc F5 làm mất state).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { assignmentsApi } from '../src/services';
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

const VALID_STATE = {
  teamName: 'Nhóm Rồng Vàng',
  assignmentName: 'Đợt 1 - Lập trình Web - K21',
  fileNames: ['bai-lam.md', 'bai-lam.xml'],
  resubmitted: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  listAssignments.mockResolvedValue([]);
});

describe('SubmitSuccessPage', () => {
  it('hiển thị thông báo thành công kèm tên nhóm, đợt chấm và danh sách file', () => {
    renderAppAt('/submit-success', VALID_STATE);

    expect(screen.getByText('Đã nộp bài thành công')).toBeDefined();
    expect(screen.getByText(/Nhóm Rồng Vàng/)).toBeDefined();
    expect(screen.getByText(/Đợt 1 - Lập trình Web - K21/)).toBeDefined();
    expect(screen.getByText('bai-lam.md')).toBeDefined();
    expect(screen.getByText('bai-lam.xml')).toBeDefined();
  });

  it('nói rõ hệ thống không gửi email (Requirement 2.11)', () => {
    renderAppAt('/submit-success', VALID_STATE);

    expect(screen.getByText(/không gửi email xác nhận/)).toBeDefined();
  });

  it('vào thẳng URL mà không có state thì chuyển về danh sách đợt chấm', async () => {
    renderAppAt('/submit-success');

    // Requirement 2.10: không có bằng chứng -> không được nói "thành công".
    expect(screen.queryByText('Đã nộp bài thành công')).toBeNull();
    expect(await screen.findByText('Hiện không có đợt chấm nào đang mở')).toBeDefined();
  });

  it('state không đúng shape cũng bị coi như không có state', async () => {
    renderAppAt('/submit-success', { teamName: 'Nhóm X' });

    expect(screen.queryByText('Đã nộp bài thành công')).toBeNull();
    expect(await screen.findByText('Hiện không có đợt chấm nào đang mở')).toBeDefined();
  });
});

describe('SubmitSuccessPage - phân biệt nộp lại (Requirement 2.14)', () => {
  it('state thiếu cờ resubmitted bị coi là không hợp lệ', async () => {
    renderAppAt('/submit-success', {
      teamName: VALID_STATE.teamName,
      assignmentName: VALID_STATE.assignmentName,
      fileNames: VALID_STATE.fileNames,
      // CỐ TÌNH thiếu `resubmitted`.
    });

    // Thiếu field bắt buộc -> không có bằng chứng đáng tin, không nói "thành công".
    expect(screen.queryByText('Đã nộp bài thành công')).toBeNull();
    expect(await screen.findByText('Hiện không có đợt chấm nào đang mở')).toBeDefined();
  });

  it('nói rõ bản nộp trước đã bị thay thế khi là lần nộp lại', () => {
    renderAppAt('/submit-success', { ...VALID_STATE, resubmitted: true });

    expect(screen.getByText('Đã nộp lại bài thành công')).toBeDefined();
    expect(screen.getByText(/thay thế bản nộp trước đó/)).toBeDefined();
  });
});
