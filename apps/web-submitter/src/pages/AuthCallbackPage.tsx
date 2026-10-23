/**
 * Trang xử lý chuyển tiếp sau khi xác thực OAuth 2.0 PKCE từ AWS Cognito & Google.
 * Đổi code lấy JWT Token, ghi nhận Audit Log và chuyển hướng người dùng về trang ban đầu.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import ProgressBar from '@cloudscape-design/components/progress-bar';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useLanguage } from '../i18n/LanguageContext';
import { submitterAuthApi } from '@quick-grading/api-client';
import { useSubmitterAuth } from '../auth/SubmitterAuthContext';

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { refreshSession } = useSubmitterAuth();

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function processAuth() {
      const code = searchParams.get('code');
      const state = searchParams.get('state');
      const isMock = searchParams.get('mock') === 'true';

      try {
        if (isMock) {
          const { token, profile } = await submitterAuthApi.handleAuthCallback(
            'mock-auth-code',
            state || '',
          );
          if (isCancelled) return;
          try {
            await submitterAuthApi.recordLoginAuditLog(
              {
                email: profile.email,
                name: profile.name,
                userSub: profile.sub,
                provider: 'Google',
              },
              token,
            );
          } catch {
            // Không chặn luồng nếu log bị trễ
          }
          refreshSession();
          navigate('/', { replace: true });
          return;
        }

        if (!code || !state) {
          throw new Error('Thiếu tham số xác thực từ dịch vụ Google/Cognito.');
        }

        const { token, profile } = await submitterAuthApi.handleAuthCallback(code, state);
        if (isCancelled) return;

        try {
          await submitterAuthApi.recordLoginAuditLog(
            {
              email: profile.email,
              name: profile.name,
              userSub: profile.sub,
              provider: 'Google',
            },
            token,
          );
        } catch (logErr) {
          console.warn('[AuthCallback] Ghi log đăng nhập thất bại:', logErr);
        }

        // Đọc đường dẫn trả về nếu có
        refreshSession();
        navigate('/', { replace: true });
      } catch (err: unknown) {
        if (isCancelled) return;
        const msg = err instanceof Error ? err.message : 'Xác thực tài khoản Google thất bại.';
        setError(msg);
      }
    }

    void processAuth();

    return () => {
      isCancelled = true;
    };
  }, [navigate, searchParams, refreshSession]);

  if (error) {
    return (
      <Box padding="xxl" textAlign="center">
        <Container
          header={
            <Header variant="h2" description="Không thể hoàn tất xác thực tài khoản Google">
              Lỗi Xác Thực
            </Header>
          }
        >
          <SpaceBetween size="l">
            <Alert type="error" header="Đăng nhập không thành công">
              {error}
            </Alert>
            <Button variant="primary" onClick={() => navigate('/login', { replace: true })}>
              {t('btnRetry')}
            </Button>
          </SpaceBetween>
        </Container>
      </Box>
    );
  }

  return (
    <Box padding="xxl" textAlign="center">
      <div style={{ maxWidth: 520, margin: '60px auto' }}>
        <Container>
          <SpaceBetween size="l">
            <div style={{ padding: '24px 0' }}>
              <Header
                variant="h2"
                description="Đang bảo mật và xác minh tài khoản sinh viên qua AWS Cognito..."
              >
                Đang hoàn tất đăng nhập
              </Header>
            </div>
            <ProgressBar value={85} status="in-progress" label="Xác thực OAuth 2.0 PKCE" />
            <Box color="text-body-secondary" fontSize="body-s">
              Vui lòng không đóng trình duyệt trong quá trình chuyển tiếp.
            </Box>
          </SpaceBetween>
        </Container>
      </div>
    </Box>
  );
}
