/**
 * Unit test cho `gradingConfigApi` — happy path + validation errors.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '@quick-grading/shared-types';
import { resetMockDb } from '@quick-grading/mock-server';
import { gradingConfigApi } from '../src/index.js';

beforeEach(() => {
  resetMockDb();
});

describe('gradingConfigApi', () => {
  it('getActiveGradingConfig trả về config active đã seed (version 1, mode RUBRIC)', async () => {
    const active = await gradingConfigApi.getActiveGradingConfig();
    expect(active).not.toBeNull();
    expect(active?.version).toBe(1);
    expect(active?.mode).toBe('RUBRIC');
    expect(active?.isActive).toBe(true);
  });

  it('saveGradingConfig tạo version mới với mode PROMPT và systemPrompt', async () => {
    const saved = await gradingConfigApi.saveGradingConfig({
      mode: 'PROMPT',
      systemPrompt: 'Đánh giá tính đúng đắn và hiệu năng của code.',
      maxInputTokens: 40000,
    });

    expect(saved.version).toBe(2);
    expect(saved.mode).toBe('PROMPT');
    expect(saved.systemPrompt).toBe('Đánh giá tính đúng đắn và hiệu năng của code.');
    expect(saved.isActive).toBe(true);

    const versions = await gradingConfigApi.listGradingConfigVersions();
    expect(versions).toHaveLength(2);
    expect(versions.map((v) => v.version)).toEqual([1, 2]);

    const active = await gradingConfigApi.getActiveGradingConfig();
    expect(active?.version).toBe(2);
    expect(active?.mode).toBe('PROMPT');
  });

  it('saveGradingConfig mode PROMPT nhưng thiếu systemPrompt sẽ ném ValidationError', async () => {
    await expect(
      gradingConfigApi.saveGradingConfig({
        mode: 'PROMPT',
        systemPrompt: '',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
