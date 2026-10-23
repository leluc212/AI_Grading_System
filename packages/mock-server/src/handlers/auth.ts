/**
 * MSW handler cho domain Auth (task 3.11) — mock login/logout đơn giản cho
 * khu vực Admin.
 *
 * ĐÂY LÀ STUB TEST-ONLY của giai đoạn 1: KHÔNG có Cognito thật, KHÔNG verify
 * JWT, KHÔNG hash mật khẩu. Chỉ dựng đúng luồng UX "phải đăng nhập mới vào
 * được Admin" (design.md > Overview: "trang Admin dùng 1 mock auth đơn giản
 * ... KHÔNG implement bảo mật thật"). Giai đoạn 2 sẽ thay toàn bộ bằng
 * Cognito Hosted UI / Amplify Auth (design.md > Giai đoạn 2 migration).
 *
 * TÀI KHOẢN ADMIN CỨNG (test-only, hardcode có chủ đích — không phải secret):
 *   - username: 'admin'
 *   - password: 'admin123'
 * Requirement 4.3: chỉ 1 nhóm Admin, mọi Admin đăng nhập hợp lệ có quyền
 * ngang nhau — nên không có field role/permission, chỉ 1 danh tính admin duy
 * nhất.
 *
 * Endpoint tương ứng các hàm service layer `authApi` mô tả ở design.md >
 * API Contract (Service Layer):
 *   - POST /api/auth/login  -> login(username, password): Promise<{ token }>
 *   - POST /api/auth/logout -> logout(): Promise<void>
 *
 * `getCurrentAdmin()` (cũng có trong API Contract) KHÔNG cần endpoint riêng ở
 * mock server — đó là hàm client-side đọc session đã lưu trong `localStorage`
 * (design.md: "lưu session trong localStorage"), không phải 1 network call.
 * Mock auth ở đây stateless: server chỉ cấp token khi đăng nhập đúng và không
 * giữ session state nào (logout do client tự xoá token khỏi localStorage).
 *
 * Lỗi trả về theo format `{ code, message }` (xem design.md > Error
 * Handling), tái dùng trực tiếp typed error class ở `shared-types`.
 *
 * _Requirements: 4.1, 4.3_
 */
import { http, HttpResponse } from 'msw';
import { DomainError, UnauthorizedError, ValidationError } from '@quick-grading/shared-types';

/** Chuyển 1 typed `DomainError` thành response `{ code, message }` đúng httpStatus của nó */
function errorResponse(error: DomainError) {
  return HttpResponse.json(
    { code: error.code, message: error.message },
    { status: error.httpStatus },
  );
}

/**
 * Tài khoản Admin cứng duy nhất dùng để test giai đoạn 1. Cố ý để plaintext:
 * đây là placeholder test-only, KHÔNG phải credential thật và sẽ biến mất khi
 * chuyển sang Cognito ở giai đoạn 2 (xem JSDoc header).
 */
const HARDCODED_ADMIN = {
  adminId: 'admin-00000000-0000-4000-8000-000000000000',
  username: 'admin',
  password: 'admin123',
} as const;

/** Body mong đợi ở `POST /api/auth/login` */
interface LoginRequestBody {
  username?: unknown;
  password?: unknown;
}

/** Session giả trả về khi đăng nhập thành công — Requirement 4.1 */
interface LoginResponse {
  /** Token giả (opaque) — giai đoạn 2 sẽ là JWT thật từ Cognito */
  token: string;
  adminId: string;
  username: string;
}

export const authHandlers = [
  // POST /api/auth/login — Requirement 4.1, 4.3
  http.post('/api/auth/login', async ({ request }) => {
    const body = (await request.json().catch(() => null)) as LoginRequestBody | null;
    const username = body?.username;
    const password = body?.password;

    if (typeof username !== 'string' || username.trim().length === 0) {
      return errorResponse(new ValidationError('Thiếu tên đăng nhập.', 'username'));
    }
    if (typeof password !== 'string' || password.length === 0) {
      return errorResponse(new ValidationError('Thiếu mật khẩu.', 'password'));
    }

    // So khớp với tài khoản admin cứng duy nhất. So sánh plaintext có chủ
    // đích (stub test-only); giai đoạn 2 việc xác thực do Cognito đảm nhiệm.
    const isValid =
      username.trim() === HARDCODED_ADMIN.username && password === HARDCODED_ADMIN.password;
    if (!isValid) {
      // Requirement 4.4 (ngữ cảnh): thông tin đăng nhập sai -> 401.
      return errorResponse(new UnauthorizedError());
    }

    // Cấp 1 token giả (opaque). Client (web-admin, task 6.2) tự lưu vào
    // localStorage để dựng route guard; mock server không giữ session state.
    const response: LoginResponse = {
      token: `mock-admin-token.${crypto.randomUUID()}`,
      adminId: HARDCODED_ADMIN.adminId,
      username: HARDCODED_ADMIN.username,
    };

    return HttpResponse.json(response, { status: 200 });
  }),

  // POST /api/auth/logout — Requirement 4.1
  http.post('/api/auth/logout', () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // POST /api/auth/submitter-login-log — Ghi nhận audit log đăng nhập sinh viên
  http.post('/api/auth/submitter-login-log', async ({ request }) => {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const email = (body?.email as string) || 'student.fcaj@gmail.com';
    const logId = crypto.randomUUID();
    const newLog = {
      logId,
      userSub: (body?.userSub as string) || 'sub-' + logId.slice(0, 8),
      email,
      name: (body?.name as string) || email.split('@')[0],
      provider: (body?.provider as string) || 'Google',
      ipAddress: '127.0.0.1',
      userAgent: request.headers.get('user-agent') || 'Browser',
      timestamp: new Date().toISOString(),
      status: 'SUCCESS' as const,
    };
    mockLoginLogs.unshift(newLog);
    return HttpResponse.json({ success: true, logId }, { status: 201 });
  }),

  // GET /api/admin/login-logs — Truy vấn danh sách nhật ký đăng nhập cho Admin
  http.get('/api/admin/login-logs', () => {
    return HttpResponse.json({ items: mockLoginLogs }, { status: 200 });
  }),
];

const mockLoginLogs: Array<{
  logId: string;
  userSub: string;
  email: string;
  name: string;
  provider: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  status: 'SUCCESS' | 'FAILED';
}> = [
  {
    logId: 'seed-log-1',
    userSub: 'google-oauth2|1092837465',
    email: 'cloud.warrior@gmail.com',
    name: 'Cloud Warrior',
    provider: 'Google',
    ipAddress: '127.0.0.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    status: 'SUCCESS',
  },
];
