/**
 * Route guard cho TOÀN BỘ khu vực Admin (task 6.2).
 *
 * Dùng làm layout route (render `<Outlet />`) nên chỉ cần bọc 1 lần trong
 * `App.tsx` là mọi route con đều được bảo vệ. Cách này an toàn hơn việc bọc
 * từng trang: thêm trang mới sau này tự động được bảo vệ, không phụ thuộc
 * việc người viết có nhớ bọc hay không (Requirement 4.1, 4.5).
 *
 * Nhắc lại cho rõ: ở giai đoạn 1 đây CHỈ là chặn ở phía UI, không phải bảo
 * mật thật — `localStorage` ai cũng sửa được và mock server không verify
 * token. Bảo vệ thật thuộc giai đoạn 2 (Cognito authorizer ở API Gateway).
 *
 * _Requirements: 4.1, 4.4, 4.5_
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuth } from './AdminAuthContext';

export function RequireAdminAuth() {
  const { isAuthenticated } = useAdminAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    // Ghi lại URL đang muốn vào để sau khi đăng nhập quay lại đúng chỗ, thay
    // vì luôn đổ về trang mặc định. `replace` để URL bị chặn không nằm lại
    // trong history (bấm Back sẽ không rơi vào vòng lặp chuyển hướng).
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <Outlet />;
}
