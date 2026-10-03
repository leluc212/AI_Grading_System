/**
 * `GradingHistoryList` — toàn bộ lượt chấm của 1 nhóm (task 8.3).
 *
 * Requirement 6.6 và Property 4 (design.md): lượt chấm cũ KHÔNG bao giờ bị
 * xoá hay ghi đè, nên trang chi tiết phải cho Admin xem được tất cả, không
 * chỉ lượt mới nhất — đó là cách truy vết "điểm này từ đâu ra", nhất là khi
 * nhóm đã nộp lại và được chấm nhiều lần.
 *
 * Hiển thị MỚI NHẤT TRƯỚC: `gradingApi.listGradingHistory` trả mảng theo thứ
 * tự thời gian tăng dần (phần tử cuối là mới nhất), còn khi đọc thì thứ Admin
 * cần thấy đầu tiên lại là lượt gần nhất. Việc đảo chỉ nằm ở tầng hiển thị,
 * không đụng tới dữ liệu.
 *
 * Mỗi lượt hiện cả `score` gốc của AI và `finalScore` sau review như 2 giá trị
 * RIÊNG (Property 5, Requirement 7.5) — nếu chỉ hiện 1 ô "điểm" thì mất dấu
 * việc Admin đã sửa điểm, vốn là thông tin cần cho việc đối chiếu.
 *
 * _Requirements: 5.3, 6.6, 7.5, 7.6, 9.3_
 */
import Badge from '@cloudscape-design/components/badge';
import Box from '@cloudscape-design/components/box';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import ExpandableSection from '@cloudscape-design/components/expandable-section';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import type { GradingResult } from '@quick-grading/shared-types';
import { formatDateTime, formatScore } from '../format';
import { deriveGradingStatus } from '../gradingStatus';
import { GradingStatusBadge } from './StatusBadge';

export interface GradingHistoryListProps {
  /** Lịch sử chấm theo thứ tự thời gian TĂNG dần (đúng như service layer trả về). */
  history: GradingResult[];
}

/** 1 ô "nhãn — giá trị" dùng lại nhiều lần trong khối chi tiết. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Box variant="awsui-key-label">{label}</Box>
      <div>{children}</div>
    </div>
  );
}

export function GradingHistoryList({ history }: GradingHistoryListProps) {
  if (history.length === 0) {
    return (
      // `data-testid` để test khoanh vùng đúng khối lịch sử: trang chi tiết
      // nhóm còn có `GradingPanel` hiển thị lượt gần nhất với các nhãn giống
      // nhau ("Điểm AI", lý do lỗi...), nên query toàn trang sẽ thấy trùng.
      <div data-testid="grading-history">
        <Container header={<Header variant="h2">Lịch sử chấm bài</Header>}>
          <Box variant="p" color="text-body-secondary">
            Nhóm này chưa được chấm lần nào.
          </Box>
        </Container>
      </div>
    );
  }

  // Đảo để mới nhất lên đầu. `toReversed` chưa đủ phổ biến trong target hiện
  // tại nên dùng `slice().reverse()` — `slice()` để KHÔNG đảo mảng gốc của
  // caller (đảo tại chỗ sẽ làm state của trang cha bị sửa ngầm).
  const newestFirst = history.slice().reverse();
  const latestAttemptId = newestFirst[0].gradingAttemptId;

  return (
    <div data-testid="grading-history">
      <Container
        header={
          <Header variant="h2" counter={`(${history.length})`}>
            Lịch sử chấm bài
          </Header>
        }
      >
        <SpaceBetween size="s">
          {newestFirst.map((attempt, indexFromNewest) => {
            // Số thứ tự theo chiều thời gian thật: lượt cũ nhất là "Lượt 1".
            const attemptNumber = history.length - indexFromNewest;
            const isLatest = attempt.gradingAttemptId === latestAttemptId;

            return (
              <ExpandableSection
                key={attempt.gradingAttemptId}
                // Mở sẵn lượt mới nhất, các lượt cũ để thu gọn.
                defaultExpanded={isLatest}
                variant="container"
                headerText={`Lượt ${attemptNumber} — ${formatDateTime(attempt.gradedAt)}`}
                headerActions={
                  <SpaceBetween direction="horizontal" size="xs">
                    {isLatest && <Badge color="blue">Mới nhất</Badge>}
                    <GradingStatusBadge status={deriveGradingStatus(attempt)} />
                  </SpaceBetween>
                }
              >
                <SpaceBetween size="m">
                  <ColumnLayout columns={4} variant="text-grid">
                    <Field label="Điểm AI">{formatScore(attempt.score)}</Field>
                    <Field label="Điểm sau review">{formatScore(attempt.finalScore)}</Field>
                    <Field label="Trạng thái review">
                      {attempt.reviewStatus === 'REVIEWED' ? (
                        <StatusIndicator type="success">Đã review</StatusIndicator>
                      ) : attempt.reviewStatus === 'PENDING_REVIEW' ? (
                        <StatusIndicator type="warning">Chờ review</StatusIndicator>
                      ) : (
                        <StatusIndicator type="info">Không cần review</StatusIndicator>
                      )}
                    </Field>
                    <Field label="Rubric version">
                      {attempt.rubricVersion !== undefined ? `v${attempt.rubricVersion}` : '—'}
                    </Field>
                  </ColumnLayout>

                  <ColumnLayout columns={2} variant="text-grid">
                    <Field label="Người trigger">{attempt.triggeredBy}</Field>
                    <Field label="Người review">{attempt.reviewedBy ?? '—'}</Field>
                  </ColumnLayout>

                  {attempt.status === 'FAILED' && (
                    <Field label="Lý do lỗi">
                      <Box variant="p" color="text-status-error">
                        {attempt.errorMessage ?? 'Không có thông tin lỗi chi tiết.'}
                      </Box>
                    </Field>
                  )}

                  {attempt.aiFeedback !== undefined && (
                    <Field label="Nhận xét của AI">
                      <Box variant="p">{attempt.aiFeedback}</Box>
                    </Field>
                  )}
                </SpaceBetween>
              </ExpandableSection>
            );
          })}
        </SpaceBetween>
      </Container>
    </div>
  );
}
