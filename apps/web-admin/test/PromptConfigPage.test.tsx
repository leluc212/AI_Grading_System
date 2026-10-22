/**
 * Test cho trang PromptConfigPage (Cấu hình AI & System Prompt).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GradingConfig } from '@quick-grading/shared-types';
import { authApi, gradingConfigApi } from '../src/services';
import { renderAppAt, seedAdminSession } from './renderApp';

vi.mock('../src/services', async () => (await import('./servicesMock')).createServicesMock());

const getActiveGradingConfig = vi.mocked(gradingConfigApi.getActiveGradingConfig);
const listGradingConfigVersions = vi.mocked(gradingConfigApi.listGradingConfigVersions);
const saveGradingConfig = vi.mocked(gradingConfigApi.saveGradingConfig);

function makeConfig(overrides: Partial<GradingConfig> = {}): GradingConfig {
  return {
    configId: 'default',
    version: 1,
    mode: 'RUBRIC',
    maxInputTokens: 50000,
    maxOutputTokens: 2000,
    autoGradeOnSubmit: false,
    isActive: true,
    createdAt: '2026-10-01T08:00:00.000Z',
    createdBy: 'admin',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  seedAdminSession('admin');
  vi.mocked(authApi.getCurrentAdmin).mockReturnValue({ username: 'admin' });
  getActiveGradingConfig.mockResolvedValue(makeConfig());
  listGradingConfigVersions.mockResolvedValue([makeConfig()]);
});

async function openPromptPage(): Promise<void> {
  renderAppAt('/prompt');
  await screen.findByRole('heading', { level: 1, name: 'Cấu hình AI & System Prompt chấm điểm' });
}

describe('PromptConfigPage', () => {
  it('hiển thị tiêu đề và thông tin phiên bản đang áp dụng', async () => {
    await openPromptPage();
    expect(
      screen.getByText(/Đang áp dụng phiên bản 1 \(RUBRIC\)/i),
    ).toBeDefined();
  });

  it('cho phép chuyển sang chế độ PROMPT và nhập nội dung System Prompt', async () => {
    const user = userEvent.setup();
    await openPromptPage();

    // Chọn radio "Chấm bằng System Prompt"
    const promptRadio = screen.getByRole('radio', { name: /Chấm bằng System Prompt/i });
    await user.click(promptRadio);

    // Xuất hiện textarea System Prompt
    const textarea = screen.getByPlaceholderText(/Nhập hướng dẫn chấm bài cho AI/i);
    expect(textarea).toBeDefined();

    await user.type(textarea, 'Chấm điểm tính năng đăng nhập và bảo mật.');
    expect((textarea as HTMLTextAreaElement).value).toBe('Chấm điểm tính năng đăng nhập và bảo mật.');
  });

  it('nút điền mẫu prompt tự động điền template chuẩn', async () => {
    const user = userEvent.setup();
    await openPromptPage();

    // Chuyển sang PROMPT
    await user.click(screen.getByRole('radio', { name: /Chấm bằng System Prompt/i }));

    const templateBtn = screen.getByRole('button', { name: /Điền mẫu Prompt gợi ý cho đồ án/i });
    await user.click(templateBtn);

    const textarea = screen.getByPlaceholderText(/Nhập hướng dẫn chấm bài cho AI/i);
    expect((textarea as HTMLTextAreaElement).value).toContain('Bạn là trợ lý AI chấm đồ án sinh viên');
  });

  it('báo lỗi nếu chọn PROMPT nhưng để trống systemPrompt khi bấm Lưu', async () => {
    const user = userEvent.setup();
    await openPromptPage();

    await user.click(screen.getByRole('radio', { name: /Chấm bằng System Prompt/i }));
    const saveBtn = screen.getByRole('button', { name: 'Lưu phiên bản mới' });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Chế độ PROMPT yêu cầu bạn phải nhập nội dung System Prompt/i)).toBeDefined();
    });
    expect(saveGradingConfig).not.toHaveBeenCalled();
  });

  it('lưu thành công phiên bản mới và hiển thị thông báo', async () => {
    const user = userEvent.setup();
    saveGradingConfig.mockResolvedValue(
      makeConfig({
        version: 2,
        mode: 'PROMPT',
        systemPrompt: 'Hướng dẫn chấm mới',
      }),
    );

    await openPromptPage();

    await user.click(screen.getByRole('radio', { name: /Chấm bằng System Prompt/i }));
    const textarea = screen.getByPlaceholderText(/Nhập hướng dẫn chấm bài cho AI/i);
    await user.type(textarea, 'Hướng dẫn chấm mới');

    const saveBtn = screen.getByRole('button', { name: 'Lưu phiên bản mới' });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(saveGradingConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'PROMPT',
          systemPrompt: 'Hướng dẫn chấm mới',
        }),
      );
      expect(screen.getByText(/Đã lưu và kích hoạt cấu hình phiên bản 2/i)).toBeDefined();
    });
  });
});
