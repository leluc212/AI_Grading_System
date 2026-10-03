/**
 * Setup chạy trước mỗi test file của `web-admin` (task 6.1).
 *
 * Giống `web-submitter`, cộng thêm 1 việc quan trọng: **xoá `localStorage`
 * sau mỗi test**. Trạng thái đăng nhập Admin được lưu ở đó (xem
 * `authApi.getCurrentAdmin`), nên nếu không dọn thì 1 test đăng nhập xong sẽ
 * làm các test sau bắt đầu ở trạng thái "đã đăng nhập" và phần kiểm thử route
 * guard mất ý nghĩa.
 *
 * Các polyfill: component Cloudscape (`AppLayout`, `TopNavigation`,
 * `SideNavigation`) đo kích thước phần tử và theo dõi media query ở runtime,
 * mà jsdom không hiện thực `ResizeObserver`/`IntersectionObserver` và (một số
 * version) `matchMedia`. Stub no-op là đủ vì test chỉ assert nội dung DOM và
 * hành vi, không assert layout.
 */
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/** Stub `matchMedia`: luôn báo "không khớp" và no-op mọi listener. */
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

/** Stub observer: không bao giờ phát callback -> component giữ layout mặc định. */
class NoopObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  takeRecords(): [] {
    return [];
  }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = NoopObserver as unknown as typeof ResizeObserver;
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = NoopObserver as unknown as typeof IntersectionObserver;
}

afterEach(() => {
  cleanup();
  // Phiên đăng nhập Admin nằm trong localStorage -> phải dọn để các test độc
  // lập với nhau.
  localStorage.clear();
});
