/**
 * Unit test cho `rubricsApi` (task 4.3) — happy path + lỗi.
 *
 * Chạy qua MSW server thật (xem `test/setup.ts`).
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { ValidationError } from '@quick-grading/shared-types';
import { resetMockDb } from '@quick-grading/mock-server';
import { rubricsApi } from '../src/index.js';

beforeEach(() => {
  resetMockDb();
});

describe('rubricsApi', () => {
  it('getActiveRubric trả về rubric active đã seed (version 1)', async () => {
    const active = await rubricsApi.getActiveRubric();
    expect(active).not.toBeNull();
    expect(active?.version).toBe(1);
    expect(active?.isActive).toBe(true);
    expect(active?.criteria.length).toBeGreaterThan(0);
  });

  it('saveRubric tạo version mới, active, và deactivate bản cũ', async () => {
    const saved = await rubricsApi.saveRubric({
      criteria: [
        { id: 'c1', label: 'Đúng đắn', weight: 70 },
        { id: 'c2', label: 'Trình bày', weight: 30 },
      ],
    });

    expect(saved.version).toBe(2);
    expect(saved.isActive).toBe(true);

    const versions = await rubricsApi.listRubricVersions();
    expect(versions).toHaveLength(2);
    // Đã sort tăng dần theo version.
    expect(versions.map((r) => r.version)).toEqual([1, 2]);
    // Bản cũ (v1) bị deactivate, bản mới (v2) active.
    expect(versions.find((r) => r.version === 1)?.isActive).toBe(false);
    expect(versions.find((r) => r.version === 2)?.isActive).toBe(true);

    // getActiveRubric giờ trả về bản mới.
    const active = await rubricsApi.getActiveRubric();
    expect(active?.version).toBe(2);
  });

  it('saveRubric với criteria rỗng ném ValidationError', async () => {
    await expect(rubricsApi.saveRubric({ criteria: [] })).rejects.toBeInstanceOf(ValidationError);
  });
});
