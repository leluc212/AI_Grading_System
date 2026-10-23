/**
 * Test suite kiểm thử luồng đăng nhập và bảo vệ chống spam của Submitter Auth.
 */
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('@quick-grading/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@quick-grading/api-client')>();
  return {
    ...actual,
    submitterAuthApi: {
      ...actual.submitterAuthApi,
      getCurrentSession: vi.fn(() => {
        const raw = localStorage.getItem('quick-grading-submitter-session');
        return raw ? JSON.parse(raw) : null;
      }),
      saveSession: vi.fn((sess) => {
        localStorage.setItem('quick-grading-submitter-session', JSON.stringify(sess));
      }),
      logout: vi.fn(() => {
        localStorage.removeItem('quick-grading-submitter-session');
      }),
      prepareGoogleLogin: vi.fn(async () => ({
        authUrl: '/auth/callback?mock=true&state=test-state',
        state: 'test-state',
      })),
      handleAuthCallback: vi.fn(async () => ({
        token: 'mock-test-token',
        profile: {
          sub: 'mock-sub',
          email: 'student.test@gmail.com',
          name: 'Test Student',
          provider: 'Google',
        },
      })),
      recordLoginAuditLog: vi.fn(async () => ({ success: true, logId: 'log-1' })),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(assignmentsApi.listAssignments).mockResolvedValue([makeAssignment()]);
  vi.mocked(assignmentsApi.getAssignment).mockResolvedValue(makeAssignment());
});

describe('Submitter Authentication & Anti-Spam Guard', () => {
  it('tự động chuyển hướng từ /submit/:id sang /login nếu chưa đăng nhập', async () => {
    // Không có session trong localStorage
    renderAppAt('/submit/a1111111-1111-4111-8111-111111111111');

    // Phải hiển thị trang đăng nhập
    expect(screen.getByRole('heading', { level: 2, name: /Đăng nhập/i })).toBeDefined();
    expect(screen.getByText(/Tiếp tục với Google/i)).toBeDefined();
    expect(
      screen.getByText(/Vui lòng đăng nhập bằng Google để vào biểu mẫu nộp bài/i),
    ).toBeDefined();
  });

  it('cho phép vào form nộp bài khi đã đăng nhập', async () => {
    // Giả lập phiên đăng nhập đã có
    localStorage.setItem(
      'quick-grading-submitter-session',
      JSON.stringify({
        token: 'valid-token',
        profile: {
          sub: 'sub-123',
          email: 'cloud.student@gmail.com',
          name: 'Cloud Student',
          provider: 'Google',
        },
      }),
    );

    renderAppAt('/submit/a1111111-1111-4111-8111-111111111111');

    expect(screen.getByRole('heading', { level: 2, name: 'Nộp bài' })).toBeDefined();
    await screen.findByText('Đợt chấm: Đợt 1 - Lập trình Web - K21');
  });

  it('đăng nhập demo mode chuyển hướng thành công về trang nộp bài', async () => {
    renderAppAt('/login', { from: '/submit/a1111111-1111-4111-8111-111111111111' });

    const demoBtn = screen.getByRole('button', { name: /Đăng nhập thử nghiệm/i });
    fireEvent.click(demoBtn);

    // Sau khi bấm demo, form nộp bài được hiển thị
    expect(screen.getByRole('heading', { level: 2, name: 'Nộp bài' })).toBeDefined();
  });
});
