/**
 * Trang chọn Assignment (FCAJ Community Modern Redesign).
 *
 * Tích hợp:
 *   - Hero Banner chuẩn phong cách Ảnh 3 (AWS First Cloud AI Journey Community)
 *   - Lưới thẻ bài nộp hiện đại, loại bỏ hoàn toàn hiện tượng "lộ viền" (Border Stacking)
 *   - Đa ngôn ngữ ENG (mặc định) & VN
 *   - Giữ nguyên 100% kết nối API `assignmentsApi.listAssignments()`
 *   - Tối ưu GPU Hardware Compositing & Smooth Card Elevating
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Assignment } from '@quick-grading/shared-types';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import TextFilter from '@cloudscape-design/components/text-filter';
import { useLanguage } from '../i18n/LanguageContext';
import { assignmentsApi } from '../services';
import { toDisplayMessage } from '../errorMessage';
import { formatDateTime } from '../format';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; openAssignments: Assignment[] };

export function SelectAssignmentPage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [filteringText, setFilteringText] = useState('');

  // Bảo toàn 100% kết nối API gốc
  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });

    assignmentsApi
      .listAssignments()
      .then((assignments) => {
        if (cancelled) {
          return;
        }
        setState({
          kind: 'ready',
          openAssignments: assignments
            .filter((assignment) => assignment.status === 'OPEN')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        console.error('[SelectAssignmentPage] Failed to load assignments:', error);
        setState({
          kind: 'error',
          message: toDisplayMessage(
            error,
            language === 'en'
              ? 'Failed to load assignments list. Please try again.'
              : 'Không tải được danh sách đợt chấm. Vui lòng thử lại.',
          ),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken, language]);

  const retry = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const goToSubmitForm = useCallback(
    (assignmentId: string) => {
      navigate(`/submit/${encodeURIComponent(assignmentId)}`);
    },
    [navigate],
  );

  const filteredAssignments = useMemo(() => {
    if (state.kind !== 'ready') {
      return [];
    }
    if (!filteringText.trim()) {
      return state.openAssignments;
    }
    const query = filteringText.toLowerCase();
    return state.openAssignments.filter((item) =>
      item.assignmentName.toLowerCase().includes(query),
    );
  }, [state, filteringText]);

  return (
    <div className="gpu-scroll-container">
      {/* 1. Hero Banner */}
      <section className="fcaj-hero-section">
        <div className="fcaj-hero-content">
          <h1 className="fcaj-hero-title">
            {t('heroHeadlinePart1')}{' '}
            <span className="fcaj-hero-accent">{t('heroHeadlinePart2')}</span>
          </h1>
          <p className="fcaj-hero-desc">{t('heroTagline')}</p>
        </div>
        <div className="fcaj-hero-illustration" aria-hidden="true">
          <img src="/bitex.png" alt="Ho Chi Minh City skyline" />
        </div>
      </section>

      {/* 2. Phần Lưới Danh Sách Bài Tập — KHÔNG BỌC CONTAINER LỘ VIỀN */}
      <section style={{ marginTop: '16px' }}>
        <Header
          variant="h2"
          description={t('selectAssignmentDesc')}
          counter={state.kind === 'ready' ? `(${state.openAssignments.length})` : undefined}
          actions={
            state.kind === 'ready' && state.openAssignments.length > 2 ? (
              <div style={{ minWidth: 260 }}>
                <TextFilter
                  filteringText={filteringText}
                  filteringPlaceholder={t('searchPlaceholder')}
                  onChange={({ detail }) => setFilteringText(detail.filteringText)}
                />
              </div>
            ) : undefined
          }
        >
          {t('selectAssignmentTitle')}
        </Header>

        {/* Loading state */}
        {state.kind === 'loading' && (
          <Box textAlign="center" padding="xxl">
            <SpaceBetween size="s" alignItems="center">
              <Spinner size="large" />
              <Box variant="p">{t('loadingAssignments')}</Box>
            </SpaceBetween>
          </Box>
        )}

        {/* Error state */}
        {state.kind === 'error' && (
          <Box margin={{ top: 'm' }}>
            <Alert
              type="error"
              header={t('loadErrorTitle')}
              action={<Button onClick={retry}>{t('btnRetry')}</Button>}
            >
              {state.message}
            </Alert>
          </Box>
        )}

        {/* Ready state: Lưới thẻ phẳng hiện đại */}
        {state.kind === 'ready' && (
          <>
            {filteredAssignments.length === 0 ? (
              <Box textAlign="center" padding="xxl" margin={{ top: 'm' }}>
                <SpaceBetween size="xs">
                  <Box variant="strong" fontSize="heading-m">
                    {t('emptyAssignmentsTitle')}
                  </Box>
                  <Box variant="p" color="text-body-secondary">
                    {t('emptyAssignmentsDesc')}
                  </Box>
                </SpaceBetween>
              </Box>
            ) : (
              <div className="fcaj-card-grid">
                {filteredAssignments.map((assignment) => (
                  <article key={assignment.assignmentId} className="fcaj-card">
                    <div>
                      {/* Card Header: Tên bài & Status Chip */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '12px',
                          marginBottom: '14px',
                        }}
                      >
                        <h3
                          style={{
                            margin: 0,
                            fontSize: '1.2rem',
                            fontWeight: 700,
                            color: 'inherit',
                          }}
                        >
                          {assignment.assignmentName}
                        </h3>
                        <div className="fcaj-status-pill">
                          <span className="fcaj-status-dot" />
                          <span>{t('statusOpen')}</span>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px',
                          fontSize: '0.875rem',
                          color: 'var(--fcaj-text-secondary)',
                          marginBottom: '20px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <svg
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                            role="presentation"
                          >
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          <span>
                            {t('createdDate')}: {formatDateTime(assignment.createdAt)}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <svg
                            width="15"
                            height="15"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                            role="presentation"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span>{t('fileReqContent')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Card Action Buttons */}
                    <div
                      style={{
                        paddingTop: '16px',
                        borderTop: '1px solid var(--fcaj-card-border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <Button
                        variant="primary"
                        iconName="upload"
                        ariaLabel={`Nộp bài cho đợt chấm ${assignment.assignmentName}`}
                        onClick={() => goToSubmitForm(assignment.assignmentId)}
                      >
                        {t('btnSubmit')}
                      </Button>
                      <Button
                        iconName="file"
                        ariaLabel="Xem lịch sử nộp bài"
                        onClick={() => navigate('/history')}
                      >
                        {t('btnHistoryCard')}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
