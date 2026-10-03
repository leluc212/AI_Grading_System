/**
 * `StatusBadge` — hiển thị trạng thái với màu + icon theo ngữ nghĩa
 * (design.md > Components and Interfaces > web-admin).
 *
 * Dùng Cloudscape `StatusIndicator` thay cho `Badge`: `StatusIndicator` có
 * sẵn bộ type ngữ nghĩa (`success`/`error`/`warning`/`in-progress`/
 * `pending`/`stopped`/`info`) kèm ICON, nên người dùng không phải phân biệt
 * trạng thái chỉ bằng màu — điều kiện cần cho accessibility (WCAG 1.4.1: màu
 * không được là phương tiện truyền đạt duy nhất). `Badge` chỉ có màu nên sẽ
 * vi phạm điểm này.
 *
 * Một component dùng cho cả 3 họ trạng thái (Assignment, Team, chấm bài) để
 * màu của cùng một ý nghĩa luôn nhất quán giữa các trang.
 *
 * _Requirements: 1.3, 5.1, 5.2_
 */
import StatusIndicator from '@cloudscape-design/components/status-indicator';
import type { StatusIndicatorProps } from '@cloudscape-design/components/status-indicator';
import type { AssignmentStatus, TeamStatus } from '@quick-grading/shared-types';
import type { DerivedGradingStatus } from '../gradingStatus';
import { DERIVED_GRADING_STATUS_LABELS } from '../gradingStatus';

type IndicatorType = StatusIndicatorProps.Type;

/** Trạng thái đợt chấm: đang mở là trạng thái "tốt", đã đóng là trung tính. */
const ASSIGNMENT_STATUS: Record<AssignmentStatus, { type: IndicatorType; label: string }> = {
  OPEN: { type: 'success', label: 'Đang mở' },
  // `stopped` (không phải `error`): đóng đợt chấm là hành động chủ động bình
  // thường của Admin, không phải sự cố.
  CLOSED: { type: 'stopped', label: 'Đã đóng' },
};

/** Trạng thái nộp bài của nhóm. */
const TEAM_STATUS: Record<TeamStatus, { type: IndicatorType; label: string }> = {
  // Nhóm đã tạo nhưng chưa nộp -> chờ, chưa phải lỗi.
  OPEN: { type: 'pending', label: 'Chưa nộp' },
  SUBMITTED: { type: 'success', label: 'Đã nộp' },
  // Đã mở khoá cho nộp lại: cần Admin/nhóm hành động tiếp -> `info`.
  RESUBMISSION_ALLOWED: { type: 'info', label: 'Được nộp lại' },
};

/** Trạng thái chấm bài dẫn xuất (xem `src/gradingStatus.ts`). */
const GRADING_STATUS: Record<DerivedGradingStatus, IndicatorType> = {
  NOT_GRADED: 'pending',
  IN_PROGRESS: 'in-progress',
  GRADED: 'success',
  // Cần Admin xem lại -> cảnh báo, không phải lỗi.
  NEEDS_REVIEW: 'warning',
  FAILED: 'error',
};

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const { type, label } = ASSIGNMENT_STATUS[status];
  return <StatusIndicator type={type}>{label}</StatusIndicator>;
}

export function TeamStatusBadge({ status }: { status: TeamStatus }) {
  const { type, label } = TEAM_STATUS[status];
  return <StatusIndicator type={type}>{label}</StatusIndicator>;
}

export function GradingStatusBadge({ status }: { status: DerivedGradingStatus }) {
  return (
    <StatusIndicator type={GRADING_STATUS[status]}>
      {DERIVED_GRADING_STATUS_LABELS[status]}
    </StatusIndicator>
  );
}
