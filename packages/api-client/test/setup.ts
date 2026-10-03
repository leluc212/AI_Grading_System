/**
 * Setup dùng chung cho toàn bộ test service layer (task 4.3).
 *
 * Chịu trách nhiệm:
 *   1. Polyfill `localStorage` (môi trường 'node' không có) để `authApi`
 *      (login/logout/getCurrentAdmin) và `db.ts` (persist store) chạy được.
 *   2. Khởi động MSW Node server với chính các `handlers` thật của
 *      `@quick-grading/mock-server` — test đi trọn đường:
 *      api-client -> fetch -> MSW handler thật -> map lỗi typed error.
 *   3. Reset handlers + localStorage sau mỗi test để các test độc lập nhau.
 *      (Việc `resetMockDb()` về seed data được từng test-file gọi trong
 *      `beforeEach` — xem các file *.test.ts.)
 */
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { handlers } from '@quick-grading/mock-server';

/** Polyfill `localStorage` tối thiểu, đủ cho session + persist mock store. */
class LocalStorageMock {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new LocalStorageMock(),
    configurable: true,
    writable: true,
  });
}

/**
 * Polyfill `location` cho môi trường 'node'.
 *
 * Các handler đăng ký path TƯƠNG ĐỐI (ví dụ `http.post('/api/auth/login')`).
 * MSW resolve path tương đối này dựa trên `location.href`; ở trình duyệt luôn
 * có `location`, nhưng môi trường 'node' của Vitest thì KHÔNG, khiến MSW
 * không ghép được path tương đối với request tuyệt đối
 * (`http://localhost/api/...`) -> mọi request bị coi là "unhandled". Đặt
 * `location` trỏ về cùng origin với `QG_API_BASE_URL` (xem `vitest.config.ts`)
 * để MSW resolve `/api/...` thành `http://localhost/api/...` khớp đúng request
 * mà api-client gửi đi.
 */
if (typeof globalThis.location === 'undefined') {
  Object.defineProperty(globalThis, 'location', {
    value: new URL('http://localhost/'),
    configurable: true,
    writable: true,
  });
}

/** MSW Node server dùng các handler thật của mock-server. */
export const server = setupServer(...handlers);

beforeAll(() => {
  // 'error' -> báo ngay nếu có request không khớp handler nào (giúp phát
  // hiện sai endpoint/base URL thay vì lặng lẽ đi ra network thật).
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
  globalThis.localStorage.clear();
});

afterAll(() => {
  server.close();
});
