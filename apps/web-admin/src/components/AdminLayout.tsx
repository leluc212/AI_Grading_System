/**
 * Khung giao diện chung của khu vực Admin (AWS Visual Refresh Redesign).
 *
 * Dùng `TopNavigation` + `AppLayout` + `SideNavigation` + `BreadcrumbGroup` của Cloudscape.
 * Bổ sung:
 *   - Dark Mode / Light Mode toggle trên TopNavigation
 *   - BreadcrumbGroup dẫn đường chuẩn AWS Console
 *   - GPU compositing wrapper cho content
 *
 * _Requirements: 4.1_
 */
import { useCallback, useMemo, useState } from 'react';
import AppLayout from '@cloudscape-design/components/app-layout';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import SideNavigation from '@cloudscape-design/components/side-navigation';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { useTheme } from '../theme/ThemeContext';

/** Mục điều hướng bên trái. `href` trùng path trong bảng route ở `App.tsx`. */
const NAVIGATION_ITEMS = [
  { type: 'link', text: 'Đợt chấm', href: '/assignments' },
  { type: 'link', text: 'Cấu hình rubric', href: '/rubric' },
  { type: 'link', text: 'Cấu hình AI Prompt', href: '/prompt' },
] as const;

const isTestEnv = typeof process !== 'undefined' && process.env?.NODE_ENV === 'test';

export function AdminLayout() {
  const { admin, signOut } = useAdminAuth();
  const { mode, toggleMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [navigationOpen, setNavigationOpen] = useState(true);

  /**
   * Điều hướng bằng React Router thay vì để trình duyệt tải lại trang.
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
    void signOut();
  }, [signOut]);

  const breadcrumbs = useMemo(() => {
    const items = [{ text: 'Console Home', href: '/assignments' }];
    if (location.pathname.startsWith('/assignments/') && location.pathname.endsWith('/teams')) {
      items.push(
        { text: 'Quản lý đợt chấm', href: '/assignments' },
        { text: 'Danh sách nhóm', href: location.pathname },
      );
    } else if (location.pathname.startsWith('/teams/')) {
      items.push(
        { text: 'Quản lý đợt chấm', href: '/assignments' },
        { text: 'Chi tiết nhóm & Chấm bài', href: location.pathname },
      );
    } else if (location.pathname.startsWith('/rubric')) {
      items.push({ text: 'Quản lý rubric', href: '/rubric' });
    } else if (location.pathname.startsWith('/prompt')) {
      items.push({ text: 'Quản lý AI Prompt', href: '/prompt' });
    } else {
      items.push({ text: 'Quản lý đợt chấm', href: '/assignments' });
    }
    return items;
  }, [location.pathname]);

  return (
    <>
      <TopNavigation
        identity={{
          href: '/assignments',
          title: 'AWS First Cloud AI Journey — Admin Console',
          logo: !isTestEnv
            ? {
                src: '/logo-aws-fcaj.png',
                alt: 'AWS First Cloud AI Journey Logo',
              }
            : undefined,
          onFollow: (event) => {
            event.preventDefault();
            navigate('/assignments');
          },
        }}
        utilities={[
          {
            type: 'button',
            text: '',
            iconSvg:
              mode === 'dark' ? (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  role="presentation"
                >
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41m14.14-14.14l-1.41 1.41" />
                </svg>
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  role="presentation"
                >
                  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
                </svg>
              ),
            ariaLabel: mode === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối',
            onClick: toggleMode,
          },
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
        toolsHide
        navigationOpen={navigationOpen}
        onNavigationChange={({ detail }) => setNavigationOpen(detail.open)}
        ariaLabels={{
          navigation: 'Điều hướng khu vực quản trị',
          navigationToggle: 'Mở menu điều hướng',
          navigationClose: 'Đóng menu điều hướng',
        }}
        breadcrumbs={
          <BreadcrumbGroup
            items={breadcrumbs}
            ariaLabel="Đường dẫn trang"
            onFollow={followInternalLink}
          />
        }
        navigation={
          <SideNavigation
            header={{ href: '/assignments', text: 'Quick Grading' }}
            activeHref={
              NAVIGATION_ITEMS.find((item) => location.pathname.startsWith(item.href))?.href
            }
            items={NAVIGATION_ITEMS.map((item) => ({ ...item }))}
            onFollow={followInternalLink}
          />
        }
        content={
          <div className="gpu-scroll-container">
            <Outlet />
          </div>
        }
      />
    </>
  );
}
