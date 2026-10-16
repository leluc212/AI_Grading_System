import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readEnv } from '../../src/lib/env.js';

const KEYS = ['TABLE_NAME', 'BUCKET_NAME', 'STAGE'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }
});

describe('readEnv', () => {
  it('đọc đủ 3 biến', () => {
    process.env.TABLE_NAME = 'QuickGrading-dev';
    process.env.BUCKET_NAME = 'quick-grading-dev-123';
    process.env.STAGE = 'dev';
    expect(readEnv()).toEqual({
      tableName: 'QuickGrading-dev',
      bucketName: 'quick-grading-dev-123',
      stage: 'dev',
    });
  });

  it('throw khi thiếu hoặc rỗng', () => {
    process.env.TABLE_NAME = 'QuickGrading-dev';
    process.env.BUCKET_NAME = '  ';
    process.env.STAGE = 'dev';
    expect(() => readEnv()).toThrow(/BUCKET_NAME/);
    delete process.env.STAGE;
    process.env.BUCKET_NAME = 'b';
    expect(() => readEnv()).toThrow(/STAGE/);
  });
});
