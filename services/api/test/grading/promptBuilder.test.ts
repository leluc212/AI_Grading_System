import { describe, it, expect } from 'vitest';
import type { GradingConfig, Rubric } from '@quick-grading/shared-types';
import { buildGradingPrompt } from '../../src/grading/promptBuilder.js';

describe('promptBuilder', () => {
  const sampleRubric: Rubric = {
    rubricId: 'default',
    version: 1,
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    criteria: [
      { id: 'c1', label: 'Tính đúng đắn', weight: 40, description: 'Chạy đúng chức năng' },
      { id: 'c2', label: 'Kiến trúc & Clean Code', weight: 60, description: 'Thiết kế chuẩn' },
    ],
  };

  const sampleRubricConfig: GradingConfig = {
    configId: 'default',
    version: 1,
    mode: 'RUBRIC',
    maxInputTokens: 50_000,
    maxOutputTokens: 2_000,
    autoGradeOnSubmit: false,
    isActive: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    createdBy: 'admin',
  };

  it('phần tĩnh giống hệt nhau giữa 2 bài nộp khác nhau (tối ưu prompt caching)', () => {
    const prompt1 = buildGradingPrompt({
      config: sampleRubricConfig,
      rubric: sampleRubric,
      mdContent: '# Báo cáo bài 1\nNội dung A',
      xmlContent: '<data>1</data>',
    });

    const prompt2 = buildGradingPrompt({
      config: sampleRubricConfig,
      rubric: sampleRubric,
      mdContent: '# Báo cáo bài 2\nNội dung hoàn toàn khác B',
      xmlContent: '<data>2</data>',
    });

    expect(prompt1.systemInstructions).toBe(prompt2.systemInstructions);
    expect(prompt1.cacheKey).toBe(prompt2.cacheKey);
    expect(prompt1.userMessage).not.toBe(prompt2.userMessage);
  });

  it('tuyệt đối không chứa thông tin cá nhân SV', () => {
    const prompt = buildGradingPrompt({
      config: sampleRubricConfig,
      rubric: sampleRubric,
      mdContent: '# Báo cáo',
      xmlContent: '<data></data>',
    });

    expect(prompt.systemInstructions).not.toContain('studentCode');
    expect(prompt.systemInstructions).not.toContain('email');
    expect(prompt.userMessage).not.toContain('studentCode');
    expect(prompt.userMessage).not.toContain('email');
  });

  it('chế độ RUBRIC chứa danh sách tiêu chí Rubric', () => {
    const prompt = buildGradingPrompt({
      config: sampleRubricConfig,
      rubric: sampleRubric,
      mdContent: '# Test',
      xmlContent: '<data></data>',
    });

    expect(prompt.systemInstructions).toContain('KHUNG TIÊU CHÍ CHẤM ĐIỂM (RUBRIC)');
    expect(prompt.systemInstructions).toContain('Tính đúng đắn');
    expect(prompt.systemInstructions).toContain('Kiến trúc & Clean Code');
  });

  it('chế độ PROMPT chứa systemPrompt của giảng viên', () => {
    const promptConfig: GradingConfig = {
      ...sampleRubricConfig,
      mode: 'PROMPT',
      systemPrompt: 'Đánh giá kỹ năng viết clean code và bảo mật.',
    };

    const prompt = buildGradingPrompt({
      config: promptConfig,
      mdContent: '# Test',
      xmlContent: '<data></data>',
    });

    expect(prompt.systemInstructions).toContain('HƯỚNG DẪN CHẤM BÀI CỦA GIẢNG VIÊN');
    expect(prompt.systemInstructions).toContain('Đánh giá kỹ năng viết clean code và bảo mật.');
    expect(prompt.systemInstructions).not.toContain('KHUNG TIÊU CHÍ CHẤM ĐIỂM (RUBRIC)');
  });

  it('chế độ HYBRID chứa cả Rubric và hướng dẫn của giảng viên', () => {
    const hybridConfig: GradingConfig = {
      ...sampleRubricConfig,
      mode: 'HYBRID',
      systemPrompt: 'Ưu tiên kiểm tra xử lý lỗi ngoại lệ.',
    };

    const prompt = buildGradingPrompt({
      config: hybridConfig,
      rubric: sampleRubric,
      mdContent: '# Test',
      xmlContent: '<data></data>',
    });

    expect(prompt.systemInstructions).toContain('KHUNG TIÊU CHÍ CHẤM ĐIỂM (RUBRIC)');
    expect(prompt.systemInstructions).toContain('Tính đúng đắn');
    expect(prompt.systemInstructions).toContain('HƯỚNG DẪN BỔ SUNG CỦA GIẢNG VIÊN');
    expect(prompt.systemInstructions).toContain('Ưu tiên kiểm tra xử lý lỗi ngoại lệ.');
  });

  it('quăng lỗi nếu thiếu Rubric trong chế độ RUBRIC hoặc thiếu systemPrompt trong PROMPT', () => {
    expect(() =>
      buildGradingPrompt({
        config: sampleRubricConfig,
        mdContent: '# Test',
        xmlContent: '<data></data>',
      }),
    ).toThrowError(/yêu cầu Rubric/);

    expect(() =>
      buildGradingPrompt({
        config: { ...sampleRubricConfig, mode: 'PROMPT', systemPrompt: '  ' },
        mdContent: '# Test',
        xmlContent: '<data></data>',
      }),
    ).toThrowError(/systemPrompt không được để trống/);
  });
});
