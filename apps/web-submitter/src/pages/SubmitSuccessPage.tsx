/**
 * Trang thông báo nộp bài thành công (task 5.6).
 *
 * Requirement 2.9c: sau khi API trả OK, hiển thị thông báo "Đã nộp bài thành
 * công" ngay trên trang web.
 *
 * Nguyên tắc quan trọng — **chỉ hiển thị thành công khi có bằng chứng**. Dữ
 * liệu hiển thị đến từ `location.state` do form đặt sau khi `createTeamAndSubmit`
 * trả về. Nếu vào thẳng `/submit-success` (gõ URL, bookmark, hoặc F5 làm mất
 * state) thì KHÔNG có gì chứng minh bài đã được ghi nhận, nên trang này
 * chuyển hướng về đầu luồng thay vì nói "thành công" một cách vô căn cứ
 * (Requirement 2.10 — không hiển thị thành công khi chưa chắc đã thành công).
 *
 * _Requirements: 2.9, 2.10_
 */
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '../i18n/LanguageContext';
import { isSubmitSuccessState } from '../submitSuccessState';

export function SubmitSuccessPage() {
  const { t, language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();

  if (!isSubmitSuccessState(location.state)) {
    return <Navigate to="/" replace />;
  }

  const { teamName, assignmentName, fileNames, resubmitted } = location.state;

  return (
    <div style={{ padding: '16px 0 32px' }}>
      <div className="fcaj-receipt-card">
        <div className="fcaj-receipt-accent-bar" />
        <div className="fcaj-receipt-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 44,
                height: 44,
                borderRadius: '50%',
                backgroundColor: 'rgba(30, 161, 88, 0.14)',
                color: '#1ea158',
                flexShrink: 0,
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: '1.6rem',
                  fontWeight: 800,
                  color: 'var(--fcaj-text-primary)',
                  letterSpacing: '-0.02em',
                }}
              >
                {t('successTitle')}
              </h2>
            </div>
          </div>

          <SpaceBetween size="l">
            <Alert
              type="success"
              header={resubmitted ? t('resubmittedAlertHeader') : t('successAlertHeader')}
            >
              {resubmitted ? (
                <>
                  {language === 'vi' ? (
                    <>
                      Bản nộp mới của nhóm &ldquo;{teamName}&rdquo; đã được ghi nhận cho đợt chấm
                      &ldquo;{assignmentName}&rdquo; và thay thế bản nộp trước đó.
                    </>
                  ) : (
                    <>
                      Your updated submission for team &ldquo;{teamName}&rdquo; on assignment
                      &ldquo;{assignmentName}&rdquo; has been confirmed and replaces the previous
                      version.
                    </>
                  )}
                </>
              ) : (
                <>
                  {language === 'vi' ? (
                    <>
                      Bài của nhóm &ldquo;{teamName}&rdquo; đã được ghi nhận cho đợt chấm &ldquo;
                      {assignmentName}&rdquo;.
                    </>
                  ) : (
                    <>
                      Your project submission for team &ldquo;{teamName}&rdquo; on assignment &ldquo;
                      {assignmentName}&rdquo; has been securely recorded on AWS.
                    </>
                  )}
                </>
              )}
            </Alert>

            <SpaceBetween size="xs">
              <Box variant="awsui-key-label">{t('labelFiles')}</Box>
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                {fileNames.map((fileName) => (
                  <li key={fileName} style={{ margin: '6px 0', fontFamily: 'monospace' }}>
                    {fileName}
                  </li>
                ))}
              </ul>
            </SpaceBetween>

            <Box variant="p" color="text-body-secondary">
              {t('successNote')}
            </Box>

            <Button
              variant="primary"
              onClick={() => {
                navigate('/');
              }}
            >
              {t('btnBackHome')}
            </Button>
          </SpaceBetween>
        </div>
      </div>
    </div>
  );
}
