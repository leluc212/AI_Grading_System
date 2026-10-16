import { describe, expect, it } from 'vitest';
import { ValidationError } from '@quick-grading/shared-types';
import { assertFileHead } from '../../src/domain/fileContent.js';

const enc = (s: string) => new TextEncoder().encode(s);

describe('assertFileHead', () => {
  it('md văn bản bình thường: OK', () => {
    expect(() => assertFileHead('md', enc('# Bài làm\n'))).not.toThrow();
  });

  it('md chứa byte NUL: từ chối', () => {
    expect(() => assertFileHead('md', new Uint8Array([0x23, 0x00, 0x41]))).toThrow(ValidationError);
  });

  it('xml có BOM + khoảng trắng rồi "<": OK', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...enc(' \r\n\t<?xml version="1.0"?>')]);
    expect(() => assertFileHead('xml', bytes)).not.toThrow();
  });

  it('xml bắt đầu bằng ký tự khác "<" hoặc rỗng: từ chối', () => {
    expect(() => assertFileHead('xml', enc('abc<root/>'))).toThrow(ValidationError);
    expect(() => assertFileHead('xml', enc('   '))).toThrow(ValidationError);
  });

  it('không parse XML (entity không bị mở rộng, chỉ nhìn ký tự đầu)', () => {
    const xxe = '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>';
    expect(() => assertFileHead('xml', enc(xxe))).not.toThrow();
  });
});
