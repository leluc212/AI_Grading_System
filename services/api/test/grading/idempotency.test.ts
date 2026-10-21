import { describe, it, expect } from 'vitest';
import { buildIdempotencyKey } from '../../src/grading/idempotency.js';

describe('buildIdempotencyKey', () => {
  it('sinh mã sha256 64 ký tự nhất quán với cùng tham số', () => {
    const key1 = buildIdempotencyKey({
      teamId: 'team123',
      submissionId: 'sub456',
      rubricVersion: 1,
      gradingConfigVersion: 2,
      model: 'gpt-6.1-sol',
    });

    const key2 = buildIdempotencyKey({
      teamId: 'team123',
      submissionId: 'sub456',
      rubricVersion: 1,
      gradingConfigVersion: 2,
      model: 'gpt-6.1-sol',
    });

    expect(key1).toHaveLength(64);
    expect(key1).toBe(key2);
  });

  it('thay đổi khi bất kỳ tham số nào thay đổi', () => {
    const base = {
      teamId: 'team123',
      submissionId: 'sub456',
      rubricVersion: 1,
      gradingConfigVersion: 2,
      model: 'gpt-6.1-sol',
    };

    const keyBase = buildIdempotencyKey(base);
    const keyDiffTeam = buildIdempotencyKey({ ...base, teamId: 'team999' });
    const keyDiffSub = buildIdempotencyKey({ ...base, submissionId: 'sub999' });
    const keyDiffRubric = buildIdempotencyKey({ ...base, rubricVersion: 2 });
    const keyDiffCfg = buildIdempotencyKey({ ...base, gradingConfigVersion: 3 });
    const keyDiffModel = buildIdempotencyKey({ ...base, model: 'gpt-4o' });

    expect(keyBase).not.toBe(keyDiffTeam);
    expect(keyBase).not.toBe(keyDiffSub);
    expect(keyBase).not.toBe(keyDiffRubric);
    expect(keyBase).not.toBe(keyDiffCfg);
    expect(keyBase).not.toBe(keyDiffModel);
  });
});
