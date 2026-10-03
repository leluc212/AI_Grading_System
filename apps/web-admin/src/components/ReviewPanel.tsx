/**
 * `ReviewPanel` — review lượt chấm được AI đánh dấu cần xem lại (task 9.3).
 *
 * Requirement 7.1: chỉ hiện khi lượt chấm gần nhất có `needsReview = true` và
 * chưa được review xong — trang cha quyết định việc đó, panel này chỉ nhận
 * `grading` đã chắc chắn cần review.
 *
 * Requirement 7.3/7.4: Admin có 2 lựa chọn rạch ròi — giữ nguyên điểm AI, hoặc
 * nhập điểm mới. Dùng `RadioGroup` để buộc chọn tường minh thay vì suy đoán
 * theo kiểu "ô điểm có giá trị thì coi là sửa": nếu suy đoán, một lần gõ rồi
 * xoá sẽ biến thành hành động khác với ý Admin.
 *
 * Requirement 7.5 (và Property 5 ở design.md): điểm gốc `score` của AI KHÔNG
 * bao giờ bị ghi đè — khi giữ nguyên điểm, panel gọi `submitReview` mà KHÔNG
 * gửi `finalScore`, nên server chỉ cập nhật `reviewStatus`/`reviewedBy`.
 *
 * _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_
 */
import { useCallback, useState } from 'react';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import RadioGroup from '@cloudscape-design/components/radio-group';
import SpaceBetween from '@cloudscape-design/components/space-between';
import type { GradingResult } from '@quick-grading/shared-types';
import { GRADING_SCALE, isScoreInScale } from '@quick-grading/shared-types';
import { gradingApi } from '../services';
import { toDisplayMessage } from '../errorMessage';
import { formatScore } from '../format';

/**
 * Thang điểm lấy từ `@quick-grading/shared-types` — nguồn duy nhất cho cả UI,
 * mock server và phần xuất điểm. Server chỉ kiểm `typeof finalScore === 'number'`
 * nên ràng buộc khoảng ở đây là phần UI chặn lỗi gõ sai (ví dụ 850 thay vì 85).
 */
const { min: MIN_SCORE, max: MAX_SCORE } = GRADING_SCALE;

export interface ReviewPanelProps {
  /** Lượt chấm đang cần review. */
  grading: GradingResult;
  /** Tên Admin đang đăng nhập, ghi vào `reviewedBy`. */
  reviewedBy: string;
  /** Gọi sau khi review thành công để trang cha tải lại lịch sử chấm. */
  onReviewed: () => void;
}

type Decision = 'KEEP' | 'OVERRIDE';

export function ReviewPanel({ grading, reviewedBy, onReviewed }: ReviewPanelProps) {
  const [decision, setDecision] = useState<Decision>('KEEP');
  const [finalScoreText, setFinalScoreText] = useState('');
  const [scoreError, setScoreError] = useState<string | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    setSubmitError(undefined);

    let finalScore: number | undefined;

    if (decision === 'OVERRIDE') {
      const raw = finalScoreText.trim();
      if (raw.length === 0) {
        setScoreError('Vui lòng nhập điểm mới.');
        return;
      }
      // `Number()` chặt hơn `parseFloat`: `parseFloat('85abc')` cho 85, còn
      // ở đây phải là số thuần mới được chấp nhận.
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        setScoreError('Điểm phải là một số.');
        return;
      }
      if (!isScoreInScale(parsed)) {
        setScoreError(`Điểm phải nằm trong khoảng ${MIN_SCORE} - ${MAX_SCORE}.`);
        return;
      }
      finalScore = parsed;
    }

    setScoreError(undefined);
    setSubmitting(true);

    try {
      // Khi giữ nguyên điểm AI: KHÔNG gửi `finalScore` (Requirement 7.3) —
      // server chỉ set `reviewStatus = REVIEWED` + `reviewedBy`, `score` giữ
      // nguyên. Khi sửa điểm: gửi `finalScore` như 1 field RIÊNG, không đè
      // `score` (Requirement 7.4, 7.5).
      await gradingApi.submitReview(grading.teamId, grading.gradingAttemptId, {
        reviewedBy,
        ...(finalScore !== undefined ? { finalScore } : {}),
      });
      onReviewed();
    } catch (error: unknown) {
      console.error('[ReviewPanel] Gửi review thất bại:', error);
      setSubmitError(toDisplayMessage(error, 'Không lưu được kết quả review. Vui lòng thử lại.'));
    } finally {
      setSubmitting(false);
    }
  }, [decision, finalScoreText, grading, onReviewed, reviewedBy]);

  return (
    <Container
      header={
        <Header
          variant="h2"
          description="AI đề xuất lượt chấm này cần người xem lại trước khi chốt điểm."
        >
          Cần review
        </Header>
      }
    >
      <form
        // `noValidate`: thông báo lỗi do Cloudscape hiển thị, không phải tooltip
        // mặc định của trình duyệt (design.md > Error Handling).
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <Form
          actions={
            <Button variant="primary" formAction="submit" loading={submitting}>
              Lưu review
            </Button>
          }
        >
          <SpaceBetween size="l">
            {submitError !== undefined && (
              <Alert type="error" header="Không lưu được review">
                {submitError}
              </Alert>
            )}

            {/* Requirement 7.2: Admin cần thấy điểm và feedback của AI ngay tại
                chỗ ra quyết định (nội dung 2 file nằm cùng trang, phía trên). */}
            <div>
              <Box variant="awsui-key-label">Điểm AI đề xuất</Box>
              <Box variant="h3">{formatScore(grading.score)}</Box>
            </div>

            {grading.aiFeedback !== undefined && (
              <div>
                <Box variant="awsui-key-label">Nhận xét của AI</Box>
                <Box variant="p">{grading.aiFeedback}</Box>
              </div>
            )}

            <FormField label="Quyết định của bạn">
              <RadioGroup
                value={decision}
                onChange={({ detail }) => {
                  setDecision(detail.value as Decision);
                  // Đổi lựa chọn thì xoá lỗi cũ của ô điểm, tránh để lại thông
                  // báo không còn liên quan.
                  setScoreError(undefined);
                }}
                items={[
                  {
                    value: 'KEEP',
                    label: 'Giữ nguyên điểm AI',
                    description: 'Chỉ đánh dấu đã review, không thay đổi điểm.',
                  },
                  {
                    value: 'OVERRIDE',
                    label: 'Sửa điểm',
                    description: 'Lưu điểm mới riêng biệt; điểm AI gốc vẫn được giữ lại.',
                  },
                ]}
              />
            </FormField>

            {decision === 'OVERRIDE' && (
              <FormField
                label="Điểm cuối cùng"
                description={`Nhập số trong khoảng ${MIN_SCORE} - ${MAX_SCORE}.`}
                errorText={scoreError}
              >
                <Input
                  value={finalScoreText}
                  disabled={submitting}
                  type="number"
                  inputMode="decimal"
                  ariaLabel="Điểm cuối cùng"
                  onChange={({ detail }) => setFinalScoreText(detail.value)}
                />
              </FormField>
            )}
          </SpaceBetween>
        </Form>
      </form>
    </Container>
  );
}
