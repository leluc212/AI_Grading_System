/**
 * Setup chạy trước mỗi test file của `web-submitter` (task 5.1).
 *
 * Hai việc duy nhất ở đây:
 *
 * 1. **Polyfill các Web API mà jsdom không có nhưng Cloudscape cần.**
 *    Component Cloudscape đo kích thước phần tử và theo dõi media query ở
 *    runtime; jsdom không hiện thực `ResizeObserver`, `IntersectionObserver`
 *    và (ở một số version) `matchMedia`, nên nếu thiếu polyfill thì chỉ cần
 *    render 1 `Container` là test đã throw. Các stub dưới đây cố tình KHÔNG
 *    làm gì (no-op): test chỉ assert nội dung DOM/hành vi, không assert
 *    layout, nên không cần giả lập kích thước thật.
 *
 * 2. **Unmount cây React sau mỗi test** (`cleanup`) — vì `globals: false`
 *    trong `vite.config.ts`, Testing Library KHÔNG tự đăng ký auto-cleanup,
 *    phải gọi tay. Thiếu bước này các test sau sẽ thấy DOM của test trước và
 *    query `getBy*` fail vì tìm thấy nhiều phần tử trùng.
 */
import { afterEach, beforeEach } from 'vitest';
import { cleanup } from '@testing-library/react';

beforeEach(() => {
  try {
    localStorage.setItem('fcaj-portal-language', 'vi');
    localStorage.setItem(
      'quick-grading-submitter-session',
      JSON.stringify({
        token: 'test-token-12345',
        profile: {
          sub: 'test-google-sub-1',
          email: 'student.test@gmail.com',
          name: 'Test Student',
          provider: 'Google',
        },
      }),
    );
  } catch {
    // Ignore in tests
  }
});

/** Stub `matchMedia`: luôn báo "không khớp" và no-op mọi listener. */
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {
        /* no-op for test stub */
      },
      removeListener: () => {
        /* no-op for test stub */
      },
      addEventListener: () => {
        /* no-op for test stub */
      },
      removeEventListener: () => {
        /* no-op for test stub */
      },
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

/** Stub observer: không bao giờ phát callback -> component giữ layout mặc định. */
class NoopObserver {
  observe(): void {
    // No-op for test environment stub
  }
  unobserve(): void {
    // No-op for test environment stub
  }
  disconnect(): void {
    // No-op for test environment stub
  }
  takeRecords(): [] {
    return [];
  }
}

globalThis.ResizeObserver ??= NoopObserver as unknown as typeof ResizeObserver;
globalThis.IntersectionObserver ??= NoopObserver as unknown as typeof IntersectionObserver;

afterEach(() => {
  cleanup();
});
