import { describe, expect, it } from 'vitest';
import { buildStackConfig, parseAlarmEmails, parseAllowedOrigins } from '../lib/config.js';

const BASE: Record<string, unknown> = {
  stage: 'dev',
  account: '497320113384',
  region: 'ap-southeast-1',
  alarmEmails: 'swat.lucle@gmail.com',
  allowedOrigins: 'http://localhost:5173,http://localhost:5174',
  budgetLimitUsd: 10,
};

function build(overrides: Record<string, unknown> = {}) {
  const ctx = { ...BASE, ...overrides };
  return buildStackConfig((key) => ctx[key]);
}

describe('parseAlarmEmails', () => {
  it('1 địa chỉ', () => {
    expect(parseAlarmEmails('swat.lucle@gmail.com')).toEqual(['swat.lucle@gmail.com']);
  });

  it('nhiều địa chỉ, khoảng trắng, trùng lặp, phần tử rỗng', () => {
    expect(
      parseAlarmEmails(' a@example.com , b@example.com,,a@example.com, A@example.com '),
    ).toEqual(['a@example.com', 'b@example.com']);
  });

  it('email sai định dạng -> throw', () => {
    expect(() => parseAlarmEmails('a@example.com,not-an-email')).toThrow(/invalid email/);
  });

  it('rỗng -> throw', () => {
    expect(() => parseAlarmEmails(' , ')).toThrow(/at least one/);
    expect(() => parseAlarmEmails(undefined)).toThrow(/at least one/);
  });
});

describe('parseAllowedOrigins', () => {
  it('nhận http/https origin', () => {
    expect(parseAllowedOrigins('http://localhost:5173, https://grading.example.com')).toEqual([
      'http://localhost:5173',
      'https://grading.example.com',
    ]);
  });

  it('origin không hợp lệ -> throw', () => {
    expect(() => parseAllowedOrigins('not a url')).toThrow(/invalid URL/);
    expect(() => parseAllowedOrigins('ftp://example.com')).toThrow(/http\/https/);
    expect(() => parseAllowedOrigins('https://example.com/path')).toThrow(/bare origin/);
    expect(() => parseAllowedOrigins('https://example.com/')).toThrow(/must not end/);
    expect(() => parseAllowedOrigins('')).toThrow(/at least one/);
  });
});

describe('buildStackConfig', () => {
  it('đọc mặc định', () => {
    expect(build()).toEqual({
      stage: 'dev',
      account: '497320113384',
      region: 'ap-southeast-1',
      alarmEmails: ['swat.lucle@gmail.com'],
      allowedOrigins: ['http://localhost:5173', 'http://localhost:5174'],
      budgetLimitUsd: 10,
    });
  });

  it('stage/account/region/budget sai -> throw', () => {
    expect(() => build({ stage: 'Dev!' })).toThrow(/stage/);
    expect(() => build({ account: '123' })).toThrow(/account/);
    expect(() => build({ region: 'nowhere' })).toThrow(/region/);
    expect(() => build({ budgetLimitUsd: -1 })).toThrow(/budgetLimitUsd/);
  });
});
