import { useCallback, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import TopNavigation from '@cloudscape-design/components/top-navigation';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { toDisplayMessage } from '../errorMessage';
import { useTheme } from '../theme/ThemeContext';

/** Đường dẫn mặc định sau khi đăng nhập, khi không có URL nào bị chặn trước đó. */
const DEFAULT_LANDING_PATH = '/assignments';

function readRedirectPath(state: unknown): string {
  if (typeof state !== 'object' || state === null) {
    return DEFAULT_LANDING_PATH;
  }
  const from = (state as { from?: unknown }).from;
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) {
    return DEFAULT_LANDING_PATH;
  }
  return from;
}

export function LoginPage() {
  const { isAuthenticated, signIn } = useAdminAuth();
  const { mode, toggleMode } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const redirectPath = readRedirectPath(location.state);

  const handleSubmit = useCallback(async () => {
    const nextUsernameError =
      username.trim().length === 0 ? 'Tên đăng nhập không được để trống.' : undefined;
    const nextPasswordError = password.length === 0 ? 'Mật khẩu không được để trống.' : undefined;
    setUsernameError(nextUsernameError);
    setPasswordError(nextPasswordError);
    setSubmitError(undefined);

    if (nextUsernameError !== undefined || nextPasswordError !== undefined) {
      return;
    }

    setSubmitting(true);
    try {
      await signIn(username.trim(), password);
      navigate(redirectPath, { replace: true });
    } catch (error: unknown) {
      console.error('[LoginPage] Đăng nhập thất bại:', error);
      setSubmitError(
        toDisplayMessage(error, 'Không đăng nhập được do lỗi hệ thống. Vui lòng thử lại.'),
      );
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }, [navigate, password, redirectPath, signIn, username]);

  if (isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <>
      <TopNavigation
        identity={{
          href: '/login',
          title: 'AWS First Cloud AI Journey — Admin Console',
          logo: {
            src: '/logo-aws-fcaj.png',
            alt: 'AWS FCAJ Logo',
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
        ]}
        i18nStrings={{ overflowMenuTriggerText: 'Thêm', overflowMenuTitleText: 'Tất cả' }}
      />
      <Box padding="xxl">
        <div style={{ maxWidth: 440, margin: '48px auto' }} className="gpu-scroll-container">
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmit();
            }}
          >
            <Form
              actions={
                <Button variant="primary" formAction="submit" loading={submitting}>
                  Đăng nhập
                </Button>
              }
            >
              <Container
                header={
                  <Header variant="h1" description="Khu vực quản trị — yêu cầu đăng nhập">
                    Quick Grading
                  </Header>
                }
              >
                <SpaceBetween size="l">
                  {submitError !== undefined && (
                    <Alert type="error" header="Không đăng nhập được">
                      {submitError}
                    </Alert>
                  )}

                  <FormField label="Tên đăng nhập" errorText={usernameError}>
                    <Input
                      value={username}
                      disabled={submitting}
                      autoFocus
                      ariaLabel="Tên đăng nhập"
                      onChange={({ detail }) => setUsername(detail.value)}
                    />
                  </FormField>

                  <FormField label="Mật khẩu" errorText={passwordError}>
                    <Input
                      value={password}
                      disabled={submitting}
                      type="password"
                      ariaLabel="Mật khẩu"
                      onChange={({ detail }) => setPassword(detail.value)}
                    />
                  </FormField>
                </SpaceBetween>
              </Container>
            </Form>
          </form>
        </div>
      </Box>
    </>
  );
}
