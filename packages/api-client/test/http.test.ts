import { afterEach, describe, expect, it } from 'vitest';
import { getApiBaseUrl, setApiBaseUrl } from '../src/index.js';

describe('http - setApiBaseUrl & getApiBaseUrl', () => {
  afterEach(() => {
    // Khôi phục URL mặc định cho môi trường test
    setApiBaseUrl('http://localhost');
  });

  it('chấp nhận URL https hợp lệ và loại bỏ dấu gạch chéo cuối', () => {
    setApiBaseUrl('https://abc.execute-api.ap-southeast-1.amazonaws.com/');
    expect(getApiBaseUrl()).toBe('https://abc.execute-api.ap-southeast-1.amazonaws.com');
  });

  it('chấp nhận http://localhost với port', () => {
    setApiBaseUrl('http://localhost:3000///');
    expect(getApiBaseUrl()).toBe('http://localhost:3000');
  });

  it('chấp nhận http://127.0.0.1 với port', () => {
    setApiBaseUrl('http://127.0.0.1:8080');
    expect(getApiBaseUrl()).toBe('http://127.0.0.1:8080');
  });

  it('từ chối URL rỗng', () => {
    expect(() => setApiBaseUrl('')).toThrow('API Base URL không được để trống.');
    expect(() => setApiBaseUrl('   ')).toThrow('API Base URL không được để trống.');
  });

  it('từ chối URL http bên ngoài (không an toàn)', () => {
    expect(() => setApiBaseUrl('http://evil.com')).toThrow(
      /API Base URL dùng http không an toàn: chỉ cho phép http:\/\/localhost hoặc http:\/\/127\.0\.0\.1/,
    );
  });

  it('từ chối giao thức nguy hiểm như javascript:', () => {
    expect(() => setApiBaseUrl('javascript:alert(1)')).toThrow(
      /API Base URL chỉ chấp nhận giao thức http hoặc https/,
    );
  });

  it('từ chối chuỗi không phải URL hợp lệ', () => {
    expect(() => setApiBaseUrl('not-a-valid-url')).toThrow(/API Base URL không hợp lệ/);
  });

  it('apiFetch tự động đính kèm Authorization header nếu có session', async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeaders: HeadersInit | undefined;

    localStorage.setItem(
      'quick-grading-admin-session',
      JSON.stringify({ token: 'test-admin-jwt-token', username: 'admin' }),
    );

    globalThis.fetch = async (_input, init) => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    try {
      const { apiFetch } = await import('../src/index.js');
      await apiFetch('/api/test-auth');

      const headers = new Headers(capturedHeaders);
      expect(headers.get('Authorization')).toBe('Bearer test-admin-jwt-token');
    } finally {
      globalThis.fetch = originalFetch;
      localStorage.clear();
    }
  });
});

