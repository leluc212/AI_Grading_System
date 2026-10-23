/**
 * Trang Đăng Nhập Cổng Nộp Bài (Submission Access Portal).
 * Thiết kế chuẩn phong cách AWS First Cloud AI Journey & Dark Theme AWS.
 * Hỗ trợ xác thực danh tính sinh viên qua AWS Cognito liên kết Google OAuth PKCE,
 * chống spam và ghi nhận nhật ký đăng nhập.
 */
import { useCallback, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Alert from '@cloudscape-design/components/alert';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useSubmitterAuth } from '../auth/SubmitterAuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';

function GoogleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      role="presentation"
      focusable="false"
      style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 10 }}
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

function ShieldCheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#10b981"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      role="presentation"
      focusable="false"
      style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 6 }}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function LoginHeader({
  isDark,
  title,
  subtitle,
}: {
  readonly isDark: boolean;
  readonly title: string;
  readonly subtitle: string;
}) {
  const badgeBg = isDark ? 'rgba(255, 153, 0, 0.12)' : 'rgba(255, 153, 0, 0.15)';
  const badgeColor = isDark ? '#ff9900' : '#d97706';
  const headingColor = isDark ? '#f8fafc' : '#0f172a';
  const subColor = isDark ? '#94a3b8' : '#475569';

  return (
    <div style={{ textAlign: 'center', padding: '24px 20px 12px' }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          borderRadius: 20,
          background: badgeBg,
          border: '1px solid rgba(255, 153, 0, 0.35)',
          color: badgeColor,
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          marginBottom: 16,
        }}
      >
        <span>•</span>
        <span>AWS First Cloud AI Journey</span>
        <span>•</span>
      </div>

      <h2
        style={{
          fontSize: '28px',
          fontWeight: 800,
          margin: '0 0 10px',
          color: headingColor,
          letterSpacing: '-0.02em',
        }}
      >
        {title}
      </h2>

      <p
        style={{
          fontSize: '14px',
          lineHeight: 1.6,
          color: subColor,
          margin: 0,
          maxWidth: 520,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        {subtitle}
      </p>
    </div>
  );
}

function LoginGoogleButton({
  isDark,
  isLoading,
  onClick,
  label,
}: {
  readonly isDark: boolean;
  readonly isLoading: boolean;
  readonly onClick: () => void;
  readonly label: string;
}) {
  const borderColor = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(203, 213, 225, 0.9)';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      style={{
        width: '100%',
        padding: '14px 20px',
        borderRadius: 10,
        border: `1px solid ${borderColor}`,
        background: '#ffffff',
        color: '#1f2937',
        fontSize: '15px',
        fontWeight: 600,
        cursor: isLoading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: isLoading ? 0.7 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isLoading) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.15)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
      }}
    >
      <GoogleIcon />
      <span>{label}</span>
    </button>
  );
}

function LoginDemoSection({
  isDark,
  isLoading,
  onDemoClick,
  label,
}: {
  readonly isDark: boolean;
  readonly isLoading: boolean;
  readonly onDemoClick: () => void;
  readonly label: string;
}) {
  const dividerLine = isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0';
  const textColor = isDark ? '#64748b' : '#94a3b8';

  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          margin: '12px 0',
          color: textColor,
          fontSize: '12px',
        }}
      >
        <div style={{ flex: 1, height: 1, background: dividerLine }} />
        <span style={{ padding: '0 12px' }}>Hoặc</span>
        <div style={{ flex: 1, height: 1, background: dividerLine }} />
      </div>

      <Button onClick={onDemoClick} disabled={isLoading} fullWidth>
        {label}
      </Button>
    </div>
  );
}

function LoginWhyCard({
  isDark,
  title,
  desc,
}: {
  readonly isDark: boolean;
  readonly title: string;
  readonly desc: string;
}) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: '16px 18px',
        borderRadius: 12,
        background: isDark ? 'rgba(15, 23, 42, 0.6)' : 'rgba(241, 245, 249, 0.8)',
        border: isDark ? '1px solid rgba(255, 255, 255, 0.06)' : '1px solid rgba(226, 232, 240, 0.8)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 6,
          color: isDark ? '#38bdf8' : '#0284c7',
          fontSize: '13px',
          fontWeight: 700,
        }}
      >
        <ShieldCheckIcon />
        <span>{title}</span>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: '13px',
          lineHeight: 1.5,
          color: isDark ? '#94a3b8' : '#64748b',
        }}
      >
        {desc}
      </p>
    </div>
  );
}

function LoginSecurityBadges({
  isDark,
  cognitoLabel,
  pkceLabel,
  antiSpamLabel,
}: {
  readonly isDark: boolean;
  readonly cognitoLabel: string;
  readonly pkceLabel: string;
  readonly antiSpamLabel: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 8,
        justifyContent: 'center',
        paddingTop: 8,
      }}
    >
      <span
        style={{
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: '11px',
          fontWeight: 600,
          background: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.15)',
          color: isDark ? '#34d399' : '#059669',
          border: '1px solid rgba(16, 185, 129, 0.3)',
        }}
      >
        ✓ {cognitoLabel}
      </span>
      <span
        style={{
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: '11px',
          fontWeight: 600,
          background: isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(14, 165, 233, 0.15)',
          color: isDark ? '#38bdf8' : '#0284c7',
          border: '1px solid rgba(56, 189, 248, 0.3)',
        }}
      >
        ✓ {pkceLabel}
      </span>
      <span
        style={{
          padding: '4px 10px',
          borderRadius: 6,
          fontSize: '11px',
          fontWeight: 600,
          background: isDark ? 'rgba(255, 153, 0, 0.12)' : 'rgba(255, 153, 0, 0.15)',
          color: isDark ? '#ff9900' : '#d97706',
          border: '1px solid rgba(255, 153, 0, 0.3)',
        }}
      >
        ✓ {antiSpamLabel}
      </span>
    </div>
  );
}

export function LoginPage() {
  const { isAuthenticated, loginWithGoogle, loginWithMockGoogle, isLoading } = useSubmitterAuth();
  const { t } = useLanguage();
  const { mode } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Đọc đường dẫn trước khi bị chặn để quay lại sau đăng nhập
  const from = (location.state as { from?: string })?.from || '/';

  const handleGoogleClick = useCallback(async () => {
    setErrorMessage(null);
    try {
      await loginWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể khởi động đăng nhập Google.';
      setErrorMessage(msg);
    }
  }, [loginWithGoogle]);

  const handleDemoClick = useCallback(async () => {
    setErrorMessage(null);
    try {
      await loginWithMockGoogle('student.fcaj@gmail.com', 'FCAJ Student');
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập demo thất bại.';
      setErrorMessage(msg);
    }
  }, [loginWithMockGoogle, navigate, from]);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const isDark = mode === 'dark';
  const cardBg = isDark
    ? 'linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.85) 100%)'
    : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)';
  const cardBorder = isDark ? '1px solid rgba(255, 255, 255, 0.1)' : '1px solid rgba(226, 232, 240, 0.9)';
  const cardShadow = isDark
    ? '0 20px 40px -15px rgba(0, 0, 0, 0.6), 0 0 30px -10px rgba(255, 153, 0, 0.15)'
    : '0 20px 35px -10px rgba(0, 0, 0, 0.08)';

  return (
    <div style={{ maxWidth: 640, margin: '24px auto 60px' }}>
      <SpaceBetween size="l">
        {/* Banner tiêu đề trang login */}
        <LoginHeader isDark={isDark} title={t('loginTitle')} subtitle={t('loginSubtitle')} />

        {/* Khung đăng nhập chính */}
        <div
          style={{
            background: cardBg,
            border: cardBorder,
            borderRadius: 16,
            boxShadow: cardShadow,
            padding: '36px 32px',
            backdropFilter: 'blur(12px)',
          }}
        >
          <SpaceBetween size="l">
            {location.state?.from && (
              <Alert type="info" dismissible={false}>
                {t('loginRequiredAlert')}
              </Alert>
            )}

            {errorMessage && (
              <Alert type="error" header="Đăng nhập không thành công" dismissible>
                {errorMessage}
              </Alert>
            )}

            {/* Nút đăng nhập Google chính hãng */}
            <LoginGoogleButton
              isDark={isDark}
              isLoading={isLoading}
              onClick={handleGoogleClick}
              label={t('loginWithGoogle')}
            />

            {/* Nút demo mode tiện ích khi test hoặc dev */}
            <LoginDemoSection
              isDark={isDark}
              isLoading={isLoading}
              onDemoClick={handleDemoClick}
              label={t('loginDemoBtn')}
            />

            {/* Thẻ giải thích lý do cần đăng nhập & chống spam */}
            <LoginWhyCard
              isDark={isDark}
              title={t('loginWhyTitle')}
              desc={t('loginWhyDesc')}
            />

            {/* Huy hiệu bảo mật AWS & OAuth PKCE */}
            <LoginSecurityBadges
              isDark={isDark}
              cognitoLabel={t('loginBadgeCognito')}
              pkceLabel={t('loginBadgePkce')}
              antiSpamLabel={t('loginBadgeAntiSpam')}
            />
          </SpaceBetween>
        </div>
      </SpaceBetween>
    </div>
  );
}
