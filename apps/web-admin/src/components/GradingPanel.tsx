/**
 * `GradingPanel` — trigger chấm bài và hiển thị kết quả lượt gần nhất
 * (task 9.1, 9.2).
 *
 * Requirement 6.1: hệ thống KHÔNG tự chấm khi nhóm nộp đủ file — mọi lượt chấm
 * đều bắt đầu từ việc Admin bấm nút ở đây. Vì vậy panel này luôn hiện nút, kể
 * cả khi nhóm đã được chấm rồi (chấm lại là hành vi hợp lệ, mỗi lượt được giữ
 * riêng theo Requirement 6.6).
 *
 * Component KHÔNG tự gọi API và không giữ state: trang cha
 * (`TeamDetailPage`) sở hữu lịch sử chấm vì còn phải chia sẻ cho
 * `ReviewPanel` và `GradingHistoryList`, đồng thời lo việc poll khi lượt chấm
 * đang chạy. Nếu panel tự fetch thì sẽ có 2 nguồn sự thật lệch nhau trên cùng
 * 1 trang.
 *
 * _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_
 */
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import ColumnLayout from '@cloudscape-design/components/column-layout';
import Container from '@cloudscape-design/components/container';
import Header from '@cloudscape-design/components/header';
import SpaceBetween from '@cloudscape-design/components/space-between';
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import type { GradingResult } from '@quick-grading/shared-types';
import { formatDateTime, formatScore } from '../format';
import { resolveDisplayScore } from '../gradingStatus';

export interface GradingPanelProps {
  /** Lượt chấm gần nhất, `null` nếu nhóm chưa từng được chấm. */
  latest: GradingResult | null;
  /** True khi lượt gần nhất đang `PENDING`/`IN_PROGRESS`. */
  isGrading: boolean;
  /** True trong lúc request `triggerGrading` đang bay. */
  triggering: boolean;
  /**
   * False khi nhóm chưa nộp đủ 2 file — Requirement 6.2 chỉ cho chấm nhóm đã
   * nộp đủ. Server cũng kiểm lại; đây chỉ là phần UX chặn sớm.
   */
  canGrade: boolean;
  /** Lỗi của lần bấm "Chấm bài" gần nhất. */
  triggerError?: string;
  /**
   * True khi đã poll quá lâu mà lượt chấm vẫn `IN_PROGRESS` — không kết luận
   * là thất bại (lượt chấm có thể vẫn đang chạy), chỉ ngừng tự cập nhật.
   */
  pollTimedOut: boolean;
  onTrigger: () => void;
}

export function GradingPanel({
  latest,
  isGrading,
  triggering,
  canGrade,
  triggerError,
  pollTimedOut,
  onTrigger,
}: GradingPanelProps) {
  // Nhãn nút nói rõ đây là lượt đầu hay chấm lại, để Admin biết mình đang tạo
  // thêm 1 lượt mới chứ không ghi đè lượt cũ.
  const triggerLabel =
    latest === null ? 'Chấm bài' : latest.status === 'FAILED' ? 'Chấm lại' : 'Chấm lại';

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="Việc chấm bài chỉ chạy khi bạn bấm — hệ thống không tự chấm."
          actions={
            <Button
              variant="primary"
              iconName="gen-ai"
              loading={triggering}
              // Requirement 6.3: đang có lượt chấm chạy thì không cho tạo lượt
              // trùng. Chặn ở nút là UX; server vẫn trả `GradingInProgressError`
              // nếu lọt qua (ví dụ 2 tab cùng mở).
              disabled={isGrading || !canGrade}
              onClick={onTrigger}
            >
              {triggerLabel}
            </Button>
          }
        >
          Chấm bài
        </Header>
      }
    >
      <SpaceBetween size="m">
        {!canGrade && (
          <Alert type="info">
            Nhóm chưa nộp đủ 2 file nên chưa thể chấm bài (Yêu cầu: 1 file .md và 1 file .xml).
          </Alert>
        )}

        {triggerError !== undefined && (
          <Alert type="error" header="Không bắt đầu được lượt chấm">
            {triggerError}
          </Alert>
        )}

        {isGrading && (
          <Alert type="info">
            <SpaceBetween size="xs">
              <StatusIndicator type="in-progress">
                Đang chấm bài, kết quả sẽ tự cập nhật khi xong.
              </StatusIndicator>
              {pollTimedOut && (
                <Box variant="p">
                  Lượt chấm chạy lâu hơn dự kiến nên trang đã ngừng tự cập nhật. Bấm &ldquo;Tải
                  lại&rdquo; ở đầu trang để kiểm tra lại trạng thái.
                </Box>
              )}
            </SpaceBetween>
          </Alert>
        )}

        {latest === null && !isGrading && (
          <Box variant="p" color="text-body-secondary">
            {/* Câu này CỐ TÌNH khác câu của `GradingHistoryList` ("Nhóm này chưa
                được chấm lần nào."): cùng lúc hiện 2 câu y hệt nhau trên 1 trang
                là dư thừa, nên ở đây nói việc cần làm tiếp thay vì lặp lại
                thông tin. */}
            Chưa có lượt chấm nào. Bấm &ldquo;Chấm bài&rdquo; để bắt đầu.
          </Box>
        )}

        {/* Requirement 6.5: lượt chấm lỗi -> nói rõ lý do, và nút "Chấm lại" ở
            header phía trên cho phép thử lại ngay. */}
        {latest !== null && latest.status === 'FAILED' && (
          <Alert type="error" header="Lượt chấm gần nhất thất bại">
            {latest.errorMessage ?? 'Không có thông tin lỗi chi tiết.'}
          </Alert>
        )}

        {/* Requirement 6.4: chấm xong -> hiện điểm, feedback, thời điểm chấm. */}
        {latest !== null && latest.status === 'GRADED' && (
          <SpaceBetween size="m">
            <ColumnLayout columns={4} variant="text-grid">
              <div>
                <Box variant="awsui-key-label">Điểm cuối</Box>
                {/* Requirement 7.6: ưu tiên finalScore nếu Admin đã sửa. */}
                <Box variant="h2">{formatScore(resolveDisplayScore(latest))}</Box>
              </div>
              <div>
                <Box variant="awsui-key-label">Điểm AI</Box>
                <div>{formatScore(latest.score)}</div>
              </div>
              <div>
                <Box variant="awsui-key-label">Chấm lúc</Box>
                <div>{formatDateTime(latest.gradedAt)}</div>
              </div>
              <div>
                <Box variant="awsui-key-label">Rubric version</Box>
                <div>{latest.rubricVersion !== undefined ? `v${latest.rubricVersion}` : '—'}</div>
              </div>
            </ColumnLayout>

            {latest.aiFeedback !== undefined && (
              <div>
                <Box variant="awsui-key-label">Nhận xét của AI</Box>
                <Box variant="p">{latest.aiFeedback}</Box>
              </div>
            )}
          </SpaceBetween>
        )}
      </SpaceBetween>
    </Container>
  );
}
