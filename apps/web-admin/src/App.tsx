/**
 * Root component + bảng route của app `web-admin` (task 6.1, 6.2).
 *
 * Cấu trúc route lồng 3 lớp, mỗi lớp 1 nhiệm vụ:
 *
 *   `/login`                              -> `LoginPage` (công khai, ngoài guard)
 *   <RequireAdminAuth>                    -> chặn nếu chưa đăng nhập (6.2)
 *     <AdminLayout>                       -> TopNavigation + AppLayout + SideNavigation (6.1)
 *       `/`                               -> redirect `/assignments`
 *       `/assignments`                    -> `AssignmentsPage`      (task 7)
 *       `/assignments/:assignmentId/teams`-> `TeamsDashboardPage`   (task 8.1)
 *       `/teams/:teamId`                  -> `TeamDetailPage`       (task 8.2, 8.3, 9)
 *       `/rubric`                         -> `RubricConfigPage`     (task 10.1)
 *   `*`                                   -> redirect `/`
 *
 * Vì sao đặt guard làm route cha thay vì bọc từng trang: mọi route thêm sau
 * này tự động được bảo vệ, không phụ thuộc việc người viết có nhớ bọc hay
 * không (Requirement 4.1, 4.5). Route `*` nằm ngoài guard nhưng trỏ về `/`
 * vốn ở trong guard, nên URL lạ vẫn bị đẩy về trang đăng nhập khi chưa đăng
 * nhập.
 *
 * `AdminAuthProvider` bọc ngoài `Routes` (không phải trong 1 route) vì cả
 * `LoginPage` và guard đều cần đọc cùng 1 trạng thái đăng nhập.
 */
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider } from './auth/AdminAuthContext';
import { RequireAdminAuth } from './auth/RequireAdminAuth';
import { AdminLayout } from './components/AdminLayout';
import { AssignmentsPage } from './pages/AssignmentsPage';
import { LoginPage } from './pages/LoginPage';
import { RubricConfigPage } from './pages/RubricConfigPage';
import { TeamDetailPage } from './pages/TeamDetailPage';
import { TeamsDashboardPage } from './pages/TeamsDashboardPage';

export function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireAdminAuth />}>
          <Route element={<AdminLayout />}>
            <Route path="/" element={<Navigate to="/assignments" replace />} />
            <Route path="/assignments" element={<AssignmentsPage />} />
            <Route path="/assignments/:assignmentId/teams" element={<TeamsDashboardPage />} />
            <Route path="/teams/:teamId" element={<TeamDetailPage />} />
            <Route path="/rubric" element={<RubricConfigPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminAuthProvider>
  );
}
