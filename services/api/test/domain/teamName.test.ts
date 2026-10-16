import { describe, expect, it } from 'vitest';
import { cleanTeamName, normalizeTeamName } from '../../src/domain/teamName.js';

describe('normalizeTeamName', () => {
  it('dạng tổ hợp (NFD) và dựng sẵn (NFC) cho cùng 1 khoá', () => {
    const decomposed = 'Nho\u0301m A';
    const precomposed = 'Nhóm A';
    expect(decomposed).not.toBe(precomposed);
    expect(normalizeTeamName(decomposed)).toBe(normalizeTeamName(precomposed));
  });

  it('trim + lowercase', () => {
    expect(normalizeTeamName('  NHÓM Rồng  ')).toBe('nhóm rồng');
  });

  it('tên lưu trữ là NFC đã trim, giữ hoa/thường', () => {
    const stored = cleanTeamName('  Nho\u0301m A ');
    expect(stored).toBe('Nhóm A');
    expect(stored).toBe(stored.normalize('NFC'));
  });
});
