/**
 * Unit test cho `authApi` (task 4.3) — happy path + lỗi.
 *
 * Chạy qua MSW server thật (xem `test/setup.ts`); `localStorage` được
 * polyfill trong setup và clear sau mỗi test nên session không rò rỉ giữa
 * các test-case.
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { UnauthorizedError, ValidationError } from '@quick-grading/shared-types';
import { resetMockDb } from '@quick-grading/mock-server';
import { authApi } from '../src/index.js';

beforeEach(() => {
  resetMockDb();
});

describe('authApi', () => {
  it('login đúng thông tin trả token và getCurrentAdmin thấy phiên đăng nhập', async () => {
    const result = await authApi.login('admin', 'admin123');
    expect(result.token).toBeTruthy();

    const current = authApi.getCurrentAdmin();
    expect(current).toEqual({ username: 'admin' });
  });

  it('login sai thông tin ném UnauthorizedError', async () => {
    await expect(authApi.login('admin', 'sai-mat-khau')).rejects.toBeInstanceOf(UnauthorizedError);
    // Không lưu session khi đăng nhập thất bại.
    expect(authApi.getCurrentAdmin()).toBeNull();
  });

  it('login thiếu field ném ValidationError', async () => {
    await expect(authApi.login('', 'admin123')).rejects.toBeInstanceOf(ValidationError);
  });

  it('logout xoá phiên -> getCurrentAdmin trả null', async () => {
    await authApi.login('admin', 'admin123');
    expect(authApi.getCurrentAdmin()).not.toBeNull();

    await authApi.logout();
    expect(authApi.getCurrentAdmin()).toBeNull();
  });
});
