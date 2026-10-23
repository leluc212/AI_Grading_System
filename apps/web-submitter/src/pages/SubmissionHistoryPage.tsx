import { useCallback, useEffect, useMemo, useState } from 'react';
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import KeyValuePairs from '@cloudscape-design/components/key-value-pairs';
import Modal from '@cloudscape-design/components/modal';
import SpaceBetween from '@cloudscape-design/components/space-between';
import Spinner from '@cloudscape-design/components/spinner';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import Table from '@cloudscape-design/components/table';
import TextFilter from '@cloudscape-design/components/text-filter';
import type { SubmissionHistoryItem } from '@quick-grading/shared-types';
import { useNavigate } from 'react-router-dom';
import { useSubmitterAuth } from '../auth/SubmitterAuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { teamsApi } from '../services';
import { formatFileSizeMb } from '../validation';

export function SubmissionHistoryPage() {
  const { t, language } = useLanguage();
  const { user } = useSubmitterAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<SubmissionHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filteringText, setFilteringText] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<SubmissionHistoryItem | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!user?.email) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const history = await teamsApi.getSubmissionHistory(user.email);
      setItems(history);
    } catch (err: unknown) {
      console.error('[SubmissionHistoryPage] Lỗi tải lịch sử:', err);
      setError(
        language === 'vi'
          ? 'Không thể tải lịch sử nộp bài. Vui lòng thử lại.'
          : 'Failed to load submission history. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [language, user?.email]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredItems = useMemo(() => {
    if (!filteringText.trim()) {
      return items;
    }
    const q = filteringText.toLowerCase();
    return items.filter(
      (it) => it.teamName.toLowerCase().includes(q) || it.assignmentName.toLowerCase().includes(q),
    );
  }, [items, filteringText]);

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  return (
    <SpaceBetween size="l">
      <Header
        variant="h1"
        description={t('historySubtitle')}
        actions={
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={fetchHistory} iconName="refresh" loading={loading}>
              {language === 'vi' ? 'Làm mới' : 'Refresh'}
            </Button>
            <Button onClick={() => navigate('/')} variant="primary">
              {t('btnHistoryBack')}
            </Button>
          </SpaceBetween>
        }
      >
        {t('historyTitle')}
      </Header>

      {error && (
        <Box color="text-status-error" padding={{ vertical: 's' }}>
          {error}
        </Box>
      )}

      {loading ? (
        <Container>
          <Box textAlign="center" padding={{ vertical: 'xxl' }}>
            <Spinner size="large" />
            <Box variant="p" color="text-body-secondary" margin={{ top: 's' }}>
              {language === 'vi' ? 'Đang tải lịch sử bài nộp...' : 'Loading submission history...'}
            </Box>
          </Box>
        </Container>
      ) : items.length === 0 ? (
        <Container>
          <Box textAlign="center" padding={{ vertical: 'xxl' }}>
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                background: 'rgba(255, 153, 0, 0.1)',
                color: '#ff9900',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 16,
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <Box variant="h2">{t('emptyHistoryTitle')}</Box>
            <Box variant="p" color="text-body-secondary" margin={{ bottom: 'l', top: 'xs' }}>
              {t('emptyHistoryDesc')}
            </Box>
            <Button variant="primary" onClick={() => navigate('/')}>
              {t('btnBrowseAssignments')}
            </Button>
          </Box>
        </Container>
      ) : (
        <Table<SubmissionHistoryItem>
          items={filteredItems}
          trackBy="submissionId"
          columnDefinitions={[
            {
              id: 'assignment',
              header: t('colAssignment'),
              cell: (item) => (
                <div style={{ fontWeight: 600, color: 'var(--fcaj-text-primary)' }}>
                  {item.assignmentName || item.assignmentId}
                </div>
              ),
              sortingField: 'assignmentName',
            },
            {
              id: 'team',
              header: t('colTeam'),
              cell: (item) => (
                <SpaceBetween size="xxs">
                  <span style={{ fontWeight: 600 }}>{item.teamName}</span>
                  <span style={{ fontSize: '0.85rem', color: 'var(--fcaj-text-secondary)' }}>
                    {item.members.length} {language === 'vi' ? 'thành viên' : 'members'}
                  </span>
                </SpaceBetween>
              ),
            },
            {
              id: 'status',
              header: t('colStatus'),
              cell: (item) =>
                item.status === 'RESUBMISSION_ALLOWED' ? (
                  <StatusIndicator type="info">
                    {language === 'vi' ? 'Cho phép nộp lại' : 'Resubmission Allowed'}
                  </StatusIndicator>
                ) : (
                  <StatusIndicator type="success">
                    {language === 'vi' ? 'Đã ghi nhận' : 'Submitted'}
                  </StatusIndicator>
                ),
            },
            {
              id: 'submittedAt',
              header: t('colSubmittedAt'),
              cell: (item) => (
                <span style={{ fontSize: '0.9rem', color: 'var(--fcaj-text-secondary)' }}>
                  {formatDate(item.submittedAt)}
                </span>
              ),
            },
            {
              id: 'files',
              header: t('colFiles'),
              cell: (item) => (
                <SpaceBetween direction="horizontal" size="xs">
                  {item.files.map((f) => (
                    <Badge key={f.fileType} color={f.fileType === 'md' ? 'blue' : 'grey'}>
                      {f.fileType.toUpperCase()} ({formatFileSizeMb(f.size)})
                    </Badge>
                  ))}
                </SpaceBetween>
              ),
            },
            {
              id: 'actions',
              header: t('colActions'),
              cell: (item) => (
                <Button variant="inline-link" onClick={() => setSelectedReceipt(item)}>
                  {t('btnViewReceipt')}
                </Button>
              ),
            },
          ]}
          filter={
            <TextFilter
              filteringText={filteringText}
              filteringPlaceholder={t('historySearchPlaceholder')}
              onChange={({ detail }) => setFilteringText(detail.filteringText)}
              countText={`${filteredItems.length} ${t('historyCount')}`}
            />
          }
          header={
            <Header
              variant="h2"
              counter={`(${filteredItems.length})`}
              description={
                user?.email
                  ? `${language === 'vi' ? 'Tài khoản:' : 'Account:'} ${user.email}`
                  : undefined
              }
            >
              {language === 'vi' ? 'Danh sách bài đã nộp' : 'Your Submissions'}
            </Header>
          }
          empty={
            <Box textAlign="center" color="inherit">
              <b>
                {language === 'vi' ? 'Không tìm thấy bài nộp phù hợp' : 'No matching submissions'}
              </b>
            </Box>
          }
        />
      )}

      {selectedReceipt && (
        <Modal
          visible={Boolean(selectedReceipt)}
          onDismiss={() => setSelectedReceipt(null)}
          header={t('receiptModalTitle')}
          closeAriaLabel="Close modal"
          size="medium"
          footer={
            <Box float="right">
              <Button variant="primary" onClick={() => setSelectedReceipt(null)}>
                {language === 'vi' ? 'Đóng' : 'Close'}
              </Button>
            </Box>
          }
        >
          <SpaceBetween size="l">
            <KeyValuePairs
              columns={2}
              items={[
                {
                  label: t('colAssignment'),
                  value: selectedReceipt.assignmentName || selectedReceipt.assignmentId,
                },
                {
                  label: t('colTeam'),
                  value: selectedReceipt.teamName,
                },
                {
                  label: t('colSubmittedAt'),
                  value: formatDate(selectedReceipt.submittedAt),
                },
                {
                  label: t('receiptSubmissionId'),
                  value: (
                    <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {selectedReceipt.submissionId}
                    </span>
                  ),
                },
              ]}
            />

            <div>
              <Box variant="h4" margin={{ bottom: 'xs' }}>
                {t('receiptMembers')} ({selectedReceipt.members.length})
              </Box>
              <div
                style={{
                  borderRadius: 8,
                  border: '1px solid var(--fcaj-card-border)',
                  background: 'var(--fcaj-surface-subtle)',
                  padding: '10px 14px',
                }}
              >
                <SpaceBetween size="xs">
                  {selectedReceipt.members.map((m, idx) => (
                    <div
                      key={m.memberId || idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        fontSize: '0.9rem',
                        borderBottom:
                          idx < selectedReceipt.members.length - 1
                            ? '1px dashed var(--fcaj-card-border)'
                            : 'none',
                        paddingBottom: idx < selectedReceipt.members.length - 1 ? 6 : 0,
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{m.memberName}</span>
                      <span style={{ color: 'var(--fcaj-text-secondary)' }}>
                        {m.email} {m.studentCode ? `• MSSV: ${m.studentCode}` : ''}
                      </span>
                    </div>
                  ))}
                </SpaceBetween>
              </div>
            </div>

            <div>
              <Box variant="h4" margin={{ bottom: 'xs' }}>
                {t('receiptFiles')}
              </Box>
              <div
                style={{
                  borderRadius: 8,
                  border: '1px solid var(--fcaj-card-border)',
                  background: 'var(--fcaj-surface-subtle)',
                  padding: '10px 14px',
                }}
              >
                <SpaceBetween size="xs">
                  {selectedReceipt.files.map((f) => (
                    <div
                      key={f.fileType}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.9rem',
                      }}
                    >
                      <span>
                        📄 <b>{f.fileName}</b>
                      </span>
                      <Badge color={f.fileType === 'md' ? 'blue' : 'grey'}>
                        {formatFileSizeMb(f.size)}
                      </Badge>
                    </div>
                  ))}
                </SpaceBetween>
              </div>
            </div>

            <Box variant="p" color="text-body-secondary" fontSize="body-s">
              🔒{' '}
              {language === 'vi'
                ? 'Biên nhận bài nộp chính thức. Bài nộp đã được mã hóa và bảo vệ an toàn trên hạ tầng đám mây AWS.'
                : 'Official submission receipt. Submissions are encrypted and securely stored on AWS cloud infrastructure.'}
            </Box>
          </SpaceBetween>
        </Modal>
      )}
    </SpaceBetween>
  );
}
