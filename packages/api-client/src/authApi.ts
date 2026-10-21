/**
 * Service layer cho domain Auth (`authApi`) — Admin only.
 *
 * Giai đoạn 1 dùng MOCK auth đơn giản (design.md > Overview): server
 * (`packages/mock-server/src/handlers/auth.ts`) stateless, chỉ cấp token
 * giả khi đăng nhập đúng và KHÔNG giữ session. Session/token được lưu ở
 * PHÍA CLIENT trong `localStorage` (design.md: "lưu session trong
 * localStorage"). Giai đoạn 2 thay toàn bộ bằng Cognito Hosted UI / Amplify
 * Auth (design.md > Migration Notes) — signature các hàm ở đây giữ nguyên.
 *
 * Ánh xạ hàm -> endpoint (verified theo handler thật):
 *   - login(username, password) -> POST /api/auth/login   (trả { token, adminId, username })
 *   - logout()                  -> POST /api/auth/logout   (204 No Content)
 *   - getCurrentAdmin()         -> (đọc localStorage — KHÔNG phải network call)
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import { UnauthorizedError, ValidationError } from '@quick-grading/shared-types';
import { apiFetchJson, apiFetchVoid } from './http.js';

/**
 * Key `localStorage` lưu session Admin hiện tại. Đặt qua 1 hằng số để
 * `login`/`logout`/`getCurrentAdmin` dùng chung, tránh lệch key.
 */
const ADMIN_SESSION_KEY = 'quick-grading-admin-session';

export interface CognitoConfig {
  userPoolClientId: string;
  region?: string;
}

let cognitoConfig: CognitoConfig | null = null;

export function setCognitoConfig(config: CognitoConfig | null): void {
  cognitoConfig = config;
}

export function getCognitoConfig(): CognitoConfig | null {
  return cognitoConfig;
}

/** Shape session lưu ở client sau khi đăng nhập thành công */
interface StoredAdminSession {
  token: string;
  username: string;
}

/**
 * Shape đầy đủ handler `POST /api/auth/login` trả về. Service layer chỉ
 * hứa `{ token }` theo design contract, nhưng vẫn đọc `username` từ response
 * để lưu session cho `getCurrentAdmin` (không làm rò rỉ ra ngoài contract).
 */
interface LoginResponse {
  token: string;
  adminId: string;
  username: string;
}

/** True nếu `localStorage` khả dụng — an toàn khi chạy ngoài trình duyệt (test/Node) */
function hasLocalStorage(): boolean {
  // `typeof` không throw dù `localStorage` chưa được declare (giống cách
  // `packages/mock-server/src/db.ts` bảo vệ truy cập storage).
  return typeof localStorage !== 'undefined';
}

export const authApi = {
  setCognitoConfig,
  getCognitoConfig,

  /**
   * Đăng nhập Admin (Requirement 4.1). Trả `{ token }` theo design contract.
   *
   * Nếu có cấu hình Cognito: gọi trực tiếp Cognito InitiateAuth USER_PASSWORD_AUTH.
   * Ngược lại: fallback gọi mock server /api/auth/login.
   */
  async login(username: string, password: string): Promise<{ token: string }> {
    if (!username || username.trim().length === 0 || !password) {
      throw new ValidationError('Tên đăng nhập và mật khẩu không được để trống.');
    }

    if (cognitoConfig?.userPoolClientId) {
      const region = cognitoConfig.region ?? 'ap-southeast-1';
      const endpoint = `https://cognito-idp.${region}.amazonaws.com/`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
        },
        body: JSON.stringify({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: cognitoConfig.userPoolClientId,
          AuthParameters: {
            USERNAME: username.trim(),
            PASSWORD: password,
          },
        }),
      });

      if (!response.ok) {
        let errJson: { __type?: string; message?: string } = {};
        try {
          errJson = (await response.json()) as { __type?: string; message?: string };
        } catch {
          // ignore
        }
        const errType = errJson.__type ?? '';
        if (
          errType.includes('NotAuthorizedException') ||
          errType.includes('UserNotFoundException') ||
          errType.includes('InvalidPasswordException') ||
          errType.includes('InvalidParameterException')
        ) {
          throw new UnauthorizedError('Tài khoản hoặc mật khẩu không chính xác.');
        }
        throw new Error(errJson.message ?? 'Đăng nhập thất bại.');
      }

      const data = (await response.json()) as {
        AuthenticationResult?: {
          IdToken?: string;
          AccessToken?: string;
        };
      };
      const idToken = data.AuthenticationResult?.IdToken;
      if (!idToken) {
        throw new Error('Không nhận được IdToken từ dịch vụ xác thực Cognito.');
      }

      if (hasLocalStorage()) {
        const session: StoredAdminSession = { token: idToken, username: username.trim() };
        localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
      }

      return { token: idToken };
    }

    const result = await apiFetchJson<LoginResponse>('/api/auth/login', 'POST', {
      username,
      password,
    });

    if (hasLocalStorage()) {
      const session: StoredAdminSession = { token: result.token, username: result.username };
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    }

    return { token: result.token };
  },

  /**
   * Đăng xuất Admin (Requirement 4.1). Xoá session client + gọi endpoint
   * xác nhận (nếu chạy mock).
   */
  async logout(): Promise<void> {
    if (hasLocalStorage()) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
    }
    if (!cognitoConfig?.userPoolClientId) {
      await apiFetchVoid('/api/auth/logout', { method: 'POST' });
    }
  },

  /**
   * Lấy Admin đang đăng nhập từ session `localStorage`, hoặc `null` nếu
   * chưa đăng nhập. ĐÂY LÀ HÀM ĐỒNG BỘ, client-side — KHÔNG gọi mạng (mock
   * server stateless). Giai đoạn 2 sẽ thay bằng việc đọc phiên từ Cognito.
   *
   * An toàn khi chạy ngoài trình duyệt (test/Node): trả `null` nếu không có
   * `localStorage` hoặc dữ liệu session hỏng/không parse được.
   */
  getCurrentAdmin(): { username: string } | null {
    if (!hasLocalStorage()) {
      return null;
    }
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) {
      return null;
    }
    try {
      const session = JSON.parse(raw) as StoredAdminSession;
      if (typeof session?.username === 'string' && session.username.length > 0) {
        return { username: session.username };
      }
      return null;
    } catch {
      // Session hỏng/không phải JSON — coi như chưa đăng nhập.
      return null;
    }
  },
};
