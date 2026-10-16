import { afterEach, describe, expect, it, vi } from 'vitest';
import { log, sanitizeFields } from '../../src/lib/logger.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logger', () => {
  it('bỏ field PII, giữ id trong allowlist', () => {
    expect(
      sanitizeFields({
        requestId: 'r1',
        submissionId: 's1',
        teamId: 't1',
        email: 'a@example.com',
        teamName: 'Nhóm A',
        members: [{ email: 'a@example.com' }],
        body: '{"x":1}',
        fields: { Policy: 'secret' },
      }),
    ).toEqual({ requestId: 'r1', submissionId: 's1', teamId: 't1' });
  });

  it('ghi 1 dòng JSON không chứa PII', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log('info', 'request', { status: 201, email: 'a@example.com', teamName: 'Nhóm A' });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0][0]);
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed).toMatchObject({ level: 'info', message: 'request', status: 201 });
    expect(line).not.toContain('a@example.com');
    expect(line).not.toContain('Nhóm A');
  });

  it('error -> console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log('error', 'boom', { errorName: 'TypeError' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
