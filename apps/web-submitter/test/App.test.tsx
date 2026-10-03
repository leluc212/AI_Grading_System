/**
 * Smoke test cho khung app + routing của `web-submitter` (task 5.1).
 *
 * Phạm vi CỐ Ý hẹp: chỉ kiểm tra bảng route trong `App.tsx` map đúng path ->
 * page và URL lạ được redirect về `/`. Hành vi nghiệp vụ của từng trang được
 * kiểm thử ở file test riêng (`SelectAssignmentPage.test.tsx`,
 * `SubmitFormPage.test.tsx`).
 *
 * Lớp service bị mock để test routing không phụ thuộc mạng: `App` render ra
 * các page có gọi API ngay khi mount, nếu để gọi thật thì test vừa chậm vừa
 * phụ thuộc MSW.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
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

beforeEach(() => {
  vi.clearAllMocks();
  listAssignments.mockResolvedValue([]);
  getAssignment.mockResolvedValue(makeAssignment());
});

describe('App routing', () => {
  it('luôn hiển thị tiêu đề chung của app', async () => {
    renderAppAt('/');
    expect(screen.getByRole('heading', { level: 1, name: 'Quick Grading' })).toBeDefined();
    // Chờ request của page resolve xong để không còn state update ngoài `act`.
    await screen.findByText('Hiện không có đợt chấm nào đang mở');
  });

  it('route "/" hiển thị trang chọn bài tập', async () => {
    renderAppAt('/');
    expect(screen.getByRole('heading', { level: 2, name: 'Chọn bài tập cần nộp' })).toBeDefined();
    await screen.findByText('Hiện không có đợt chấm nào đang mở');
  });

  it('route "/submit/:assignmentId" truyền id từ URL xuống lớp service', async () => {
    renderAppAt('/submit/a1111111-1111-4111-8111-111111111111');

    expect(screen.getByRole('heading', { level: 2, name: 'Nộp bài' })).toBeDefined();
    await screen.findByText('Đợt chấm: Đợt 1 - Lập trình Web - K21');
    expect(getAssignment).toHaveBeenCalledWith('a1111111-1111-4111-8111-111111111111');
  });

  it('route "/submit-success" hiển thị trang thông báo thành công khi có state', () => {
    renderAppAt('/submit-success', {
      teamName: 'Nhóm Rồng Vàng',
      assignmentName: 'Đợt 1 - Lập trình Web - K21',
      fileNames: ['bai-lam.md', 'bai-lam.xml'],
      resubmitted: false,
    });

    expect(screen.getByRole('heading', { level: 2, name: 'Nộp bài thành công' })).toBeDefined();
  });

  it('URL không khớp route nào thì redirect về trang chọn bài tập', async () => {
    renderAppAt('/duong-dan-khong-ton-tai');
    expect(screen.getByRole('heading', { level: 2, name: 'Chọn bài tập cần nộp' })).toBeDefined();
    await screen.findByText('Hiện không có đợt chấm nào đang mở');
  });
});
