/**
 * Root component + bảng route của app `web-submitter`
 * Tái thiết kế theo chuẩn AWS First Cloud AI Journey Community (Ảnh 3).
 *
 * Tích hợp:
 *   - Logo AWS FCAJ chính thức
 *   - Nút chuyển đổi Dark/Light mode dạng Mặt Trời & Mặt Trăng (Ảnh 2)
 *   - Hệ thống đa ngôn ngữ (ENG mặc định, hỗ trợ VN)
 *   - Bố cục thoáng hiện đại, loại bỏ hoàn toàn viền lồng thô kệch
 *   - GPU Hardware Compositing
 */
import Box from '@cloudscape-design/components/box';
import BreadcrumbGroup from '@cloudscape-design/components/breadcrumb-group';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import { useMemo, type CSSProperties } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { RequireSubmitterAuth } from './auth/RequireSubmitterAuth';
import { SubmitterAuthProvider, useSubmitterAuth } from './auth/SubmitterAuthContext';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { LoginPage } from './pages/LoginPage';
import { SelectAssignmentPage } from './pages/SelectAssignmentPage';
import { SubmitFormPage } from './pages/SubmitFormPage';
import { SubmissionHistoryPage } from './pages/SubmissionHistoryPage';
import { SubmitSuccessPage } from './pages/SubmitSuccessPage';
import { ThemeProvider, useTheme } from './theme/ThemeContext';

/** Giới hạn bề rộng nội dung và canh giữa chuẩn AWS container. */
const shellStyle: CSSProperties = {
  maxWidth: 1200,
  margin: '0 auto',
  padding: '24px 32px 80px',
};

function AppContent() {
  const { t, language, toggleLanguage } = useLanguage();
  const { mode, toggleMode } = useTheme();
  const { user, isAuthenticated, logout } = useSubmitterAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const breadcrumbItems = useMemo(() => {
    const isEng = language === 'en';
    const items = [{ text: isEng ? 'Home' : 'Trang chủ', href: '/' }];
    if (location.pathname === '/login') {
      items.push({
        text: t('navLogin'),
        href: '/login',
      });
    } else if (location.pathname.startsWith('/submit/')) {
      items.push({
        text: isEng ? 'Submit' : 'Nộp bài',
        href: location.pathname,
      });
    } else if (location.pathname === '/submit-success') {
      items.push({
        text: isEng ? 'Submission Successful' : 'Nộp bài thành công',
        href: '/submit-success',
      });
    } else if (location.pathname === '/history') {
      items.push({
        text: t('navHistory'),
        href: '/history',
      });
    }
    return items;
  }, [location.pathname, language, t]);

  return (
    <>
      <TopNavigation
        identity={{
          href: '/',
          logo: {
            src: '/logo-aws-fcaj.png',
            alt: 'AWS First Cloud AI Journey Logo',
          },
          onFollow: (event) => {
            event.preventDefault();
            navigate('/');
          },
        }}
        utilities={[
          {
            type: 'button',
            text: language === 'en' ? 'Tiếng Việt' : 'English',
            iconSvg: (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                role="presentation"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            ),
            ariaLabel: language === 'en' ? 'Chuyển sang Tiếng Việt' : 'Switch to English',
            onClick: () => {
              toggleLanguage();
            },
          },
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
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
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
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ),
            ariaLabel: mode === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối',
            onClick: toggleMode,
          },
          ...(isAuthenticated && user
            ? [
                {
                  type: 'menu-dropdown' as const,
                  text: user.name || user.email,
                  description: user.email,
                  iconSvg: (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#ff9900"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  ),
                  items: [
                    { id: 'history', text: t('navHistory') },
                    { id: 'signout', text: t('navLogout') },
                  ],
                  onItemClick: (event: { detail: { id: string } }) => {
                    if (event.detail.id === 'history') {
                      navigate('/history');
                    } else if (event.detail.id === 'signout') {
                      logout();
                      navigate('/');
                    }
                  },
                },
              ]
            : [
                {
                  type: 'button' as const,
                  text: t('navLogin'),
                  iconSvg: (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                      <polyline points="10 17 15 12 10 7" />
                      <line x1="15" y1="12" x2="3" y2="12" />
                    </svg>
                  ),
                  onClick: () => {
                    navigate('/login');
                  },
                },
              ]),
        ]}
        i18nStrings={{ overflowMenuTriggerText: 'More', overflowMenuTitleText: 'Navigation' }}
      />

      <main className="gpu-scroll-container" style={shellStyle}>
        {/* Semantic h1 cho accessibility & test suite compatibility */}
        <h1
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            padding: 0,
            margin: -1,
            overflow: 'hidden',
            clip: 'rect(0, 0, 0, 0)',
            whiteSpace: 'nowrap',
            border: 0,
          }}
        >
          Quick Grading
        </h1>

        {breadcrumbItems.length > 1 && (
          <Box margin={{ bottom: 'm', top: 's' }}>
            <BreadcrumbGroup
              items={breadcrumbItems}
              ariaLabel="Breadcrumbs"
              onFollow={(event) => {
                event.preventDefault();
                navigate(event.detail.href);
              }}
            />
          </Box>
        )}

        <Routes>
          <Route path="/" element={<SelectAssignmentPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route
            path="/submit/:assignmentId"
            element={
              <RequireSubmitterAuth>
                <SubmitFormPage />
              </RequireSubmitterAuth>
            }
          />
          <Route
            path="/history"
            element={
              <RequireSubmitterAuth>
                <SubmissionHistoryPage />
              </RequireSubmitterAuth>
            }
          />
          <Route path="/submit-success" element={<SubmitSuccessPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <SubmitterAuthProvider>
          <AppContent />
        </SubmitterAuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
