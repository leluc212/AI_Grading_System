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
import { apiFetchJson, apiFetchVoid } from './http.js';

/**
 * Key `localStorage` lưu session Admin hiện tại. Đặt qua 1 hằng số để
 * `login`/`logout`/`getCurrentAdmin` dùng chung, tránh lệch key.
 */
const ADMIN_SESSION_KEY = 'quick-grading-admin-session';

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
  /**
   * Đăng nhập Admin (Requirement 4.1). Trả `{ token }` theo design contract.
   *
   * Handler trả `{ token, adminId, username }` (HTTP 200); ta lưu
   * `{ token, username }` vào `localStorage` để `getCurrentAdmin` đọc lại
   * (mock server stateless — client tự giữ session). Ném `UnauthorizedError`
   * nếu sai thông tin, `ValidationError` nếu thiếu field (đã map ở
   * `http.ts`).
   */
  async login(username: string, password: string): Promise<{ token: string }> {
    const result = await apiFetchJson<LoginResponse>('/api/auth/login', 'POST', {
      username,
      password,
    });

    if (hasLocalStorage()) {
      const session: StoredAdminSession = { token: result.token, username: result.username };
      localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    }

    // Chỉ trả đúng phần design contract cam kết.
    return { token: result.token };
  },

  /**
   * Đăng xuất Admin (Requirement 4.1). Xoá session client + gọi endpoint
   * xác nhận.
   *
   * Handler trả `204 No Content` (không body) — dùng `apiFetchVoid` để
   * KHÔNG parse JSON (tránh lỗi parse body rỗng). Xoá session localStorage
   * TRƯỚC khi gọi mạng để dù request có lỗi thì client vẫn ở trạng thái đã
   * đăng xuất.
   */
  async logout(): Promise<void> {
    if (hasLocalStorage()) {
      localStorage.removeItem(ADMIN_SESSION_KEY);
    }
    await apiFetchVoid('/api/auth/logout', { method: 'POST' });
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
