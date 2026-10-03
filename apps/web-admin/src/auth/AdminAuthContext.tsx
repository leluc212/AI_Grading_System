/**
 * Trạng thái đăng nhập Admin, dùng chung cho toàn app (task 6.2).
 *
 * Vì sao cần context thay vì gọi `authApi.getCurrentAdmin()` ở từng nơi:
 * `getCurrentAdmin()` đọc `localStorage` và là hàm ĐỒNG BỘ, không phải React
 * state — gọi rải rác thì sau khi đăng nhập/đăng xuất, các component đã render
 * sẽ không re-render và UI lệch với thực tế (route guard vẫn tưởng chưa đăng
 * nhập, thanh trên vẫn hiện tên người đã đăng xuất). Context giữ đúng 1 nguồn
 * sự thật dạng state và thông báo thay đổi cho mọi nơi.
 *
 * Phạm vi giai đoạn 1: đây là MOCK AUTH, KHÔNG phải bảo mật thật —
 * `localStorage` ai cũng sửa được, và không có gì verify token. Mục đích duy
 * nhất là dựng đúng luồng UX "phải đăng nhập mới vào được Admin" (design.md >
 * Overview). Giai đoạn 2 thay phần ruột bằng Cognito, còn `useAdminAuth()` và
 * route guard giữ nguyên hình dạng (design.md > Migration Notes).
 *
 * _Requirements: 4.1, 4.4, 4.5_
 */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../services';

/** Admin đang đăng nhập. `null` = chưa đăng nhập. */
export interface AdminIdentity {
  username: string;
}

export interface AdminAuthContextValue {
  /** Admin hiện tại, hoặc `null` nếu chưa đăng nhập. */
  admin: AdminIdentity | null;
  /** True nếu đang có phiên đăng nhập hợp lệ (tiện cho route guard đọc). */
  isAuthenticated: boolean;
  /**
   * Đăng nhập. Ném typed error từ lớp service (`UnauthorizedError` khi sai
   * tài khoản/mật khẩu, `ValidationError` khi thiếu field) để trang đăng nhập
   * tự quyết định cách hiển thị.
   */
  signIn: (username: string, password: string) => Promise<void>;
  /**
   * Đăng xuất. KHÔNG ném lỗi ra ngoài: dù request xác nhận có thất bại thì
   * phiên phía client vẫn phải bị xoá — nếu để throw, UI có thể kẹt ở trạng
   * thái "đã bấm đăng xuất nhưng vẫn đang đăng nhập".
   *
   * Đây cũng là chỗ task 7+ nên gọi khi gặp `UnauthorizedError` từ bất kỳ API
   * Admin nào (token hết hạn — Requirement 4.4): đăng xuất rồi để route guard
   * tự đẩy về trang đăng nhập.
   */
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  /**
   * Khởi tạo TỪ `localStorage` ngay trong initializer của `useState` (không
   * phải trong `useEffect`). Lý do: route guard đọc `isAuthenticated` ở lần
   * render ĐẦU TIÊN. Nếu khởi tạo trong effect, lần render đầu luôn thấy
   * `null` và Admin đang có phiên hợp lệ sẽ bị đẩy về trang đăng nhập mỗi lần
   * F5.
   */
  const [admin, setAdmin] = useState<AdminIdentity | null>(() => authApi.getCurrentAdmin());

  const signIn = useCallback(async (username: string, password: string) => {
    await authApi.login(username, password);
    // `login` đã ghi session vào localStorage; đọc lại qua cùng 1 hàm mà
    // `getCurrentAdmin` dùng để không có 2 cách hiểu về "ai đang đăng nhập".
    setAdmin(authApi.getCurrentAdmin());
  }, []);

  const signOut = useCallback(async () => {
    try {
      await authApi.logout();
    } catch (error) {
      // Không chặn luồng đăng xuất vì lỗi mạng — `authApi.logout` đã xoá
      // session localStorage TRƯỚC khi gọi mạng, nên client đã ở trạng thái
      // đã đăng xuất.
      console.error('[AdminAuth] Gọi endpoint đăng xuất thất bại:', error);
    } finally {
      setAdmin(null);
    }
  }, []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({ admin, isAuthenticated: admin !== null, signIn, signOut }),
    [admin, signIn, signOut],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

/**
 * Đọc trạng thái đăng nhập. Ném lỗi rõ ràng nếu dùng ngoài provider — hỏng
 * ngay lúc phát triển tốt hơn là trả `null` âm thầm rồi biến thành "luôn
 * chưa đăng nhập" ở route guard, vốn là một lỗi bảo mật kiểu fail-open rất
 * khó thấy.
 */
export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (context === null) {
    throw new Error('useAdminAuth phải được dùng bên trong <AdminAuthProvider>.');
  }
  return context;
}
