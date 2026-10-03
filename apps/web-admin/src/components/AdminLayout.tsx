/**
 * Khung giao diện chung của khu vực Admin (task 6.1).
 *
 * Dùng `TopNavigation` + `AppLayout` + `SideNavigation` của Cloudscape — đúng
 * bộ ba mà design.md yêu cầu cho app Admin, và là cấu trúc chuẩn của console
 * AWS nên giữ được theme nhất quán (project-context.md mục 8.3).
 *
 * Là layout route (render `<Outlet />`), đặt BÊN TRONG `RequireAdminAuth` nên
 * mọi thứ ở đây chỉ render khi đã đăng nhập — vì vậy `admin` chắc chắn khác
 * `null` và thanh trên luôn có tên người đang đăng nhập để hiển thị.
 *
 * _Requirements: 4.1_
 */
import { useCallback, useState } from 'react';
import AppLayout from '@cloudscape-design/components/app-layout';
import SideNavigation from '@cloudscape-design/components/side-navigation';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../auth/AdminAuthContext';

/** Mục điều hướng bên trái. `href` trùng path trong bảng route ở `App.tsx`. */
const NAVIGATION_ITEMS = [
  { type: 'link', text: 'Đợt chấm', href: '/assignments' },
  { type: 'link', text: 'Cấu hình rubric', href: '/rubric' },
] as const;

export function AdminLayout() {
  const { admin, signOut } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(true);

  /**
   * Điều hướng bằng React Router thay vì để trình duyệt tải lại trang.
   *
   * Cloudscape render `<a href>` thật (tốt cho a11y: mở tab mới, copy link
   * vẫn hoạt động), nên phải `preventDefault` rồi tự `navigate` — nếu không,
   * mỗi lần bấm menu là reload cả app, mất state và chạy lại MSW.
   */
  const followInternalLink = useCallback(
    (event: CustomEvent<{ href?: string; external?: boolean }>) => {
      const href = event.detail.href;
      if (event.detail.external === true || href === undefined) {
        return;
      }
      event.preventDefault();
      navigate(href);
    },
    [navigate],
  );

  const handleSignOut = useCallback(() => {
    // `signOut` không ném lỗi (xem `AdminAuthContext`), và route guard sẽ tự
    // đẩy về trang đăng nhập ngay khi state đổi -> không cần navigate tay.
    void signOut();
  }, [signOut]);

  return (
    <>
      <TopNavigation
        identity={{
          href: '/assignments',
          title: 'Quick Grading — Quản trị',
          onFollow: (event) => {
            event.preventDefault();
            navigate('/assignments');
          },
        }}
        utilities={[
          {
            type: 'menu-dropdown',
            text: admin?.username ?? '',
            description: 'Quản trị viên',
            iconName: 'user-profile',
            ariaLabel: 'Tài khoản đang đăng nhập',
            items: [{ id: 'sign-out', text: 'Đăng xuất' }],
            onItemClick: ({ detail }) => {
              if (detail.id === 'sign-out') {
                handleSignOut();
              }
            },
          },
        ]}
        i18nStrings={{ overflowMenuTriggerText: 'Thêm', overflowMenuTitleText: 'Tất cả' }}
      />
      <AppLayout
        // Không có khu vực "Tools"/help panel ở giai đoạn này -> ẩn đi thay vì
        // để 1 panel trống chiếm chỗ.
        toolsHide
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
        ariaLabels={{
          navigation: 'Điều hướng khu vực quản trị',
          navigationToggle: 'Mở menu điều hướng',
          navigationClose: 'Đóng menu điều hướng',
        }}
        navigation={
          <SideNavigation
            header={{ href: '/assignments', text: 'Quick Grading' }}
            // Tô sáng mục khớp với URL hiện tại. Dùng `startsWith` để trang
            // con (ví dụ danh sách nhóm của 1 đợt chấm) vẫn làm sáng mục cha
            // "Đợt chấm".
            activeHref={
              NAVIGATION_ITEMS.find((item) => location.pathname.startsWith(item.href))?.href
            }
            items={NAVIGATION_ITEMS.map((item) => ({ ...item }))}
            onFollow={followInternalLink}
          />
        }
        content={<Outlet />}
      />
    </>
  );
}
