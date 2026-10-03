/**
 * Dữ liệu mẫu dùng chung cho test của `web-admin`.
 *
 * Mỗi factory trả về object ĐẦY ĐỦ theo type ở `@quick-grading/shared-types`
 * và cho phép ghi đè từng field, để mỗi test chỉ nêu đúng phần khác biệt mà
 * nó quan tâm.
 */
import type {
  AssignmentListItem,
  GradingResult,
  Team,
  TeamMember,
} from '@quick-grading/shared-types';

export function makeAssignment(overrides: Partial<AssignmentListItem> = {}): AssignmentListItem {
  return {
    assignmentId: 'a-1',
    assignmentName: 'Đợt 1 - Lập trình Web - K21',
    status: 'OPEN',
    createdAt: '2024-09-01T08:00:00.000Z',
    createdBy: 'admin',
    submittedTeamCount: 0,
    ...overrides,
  };
}

export function makeMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    memberId: 'm-1',
    memberName: 'Nguyễn Văn An',
    email: 'an.nguyen@example.com',
    studentCode: 'SV001',
    ...overrides,
  };
}

export function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    teamId: 't-1',
    assignmentId: 'a-1',
    teamName: 'Nhóm Rồng Vàng',
    teamNameNormalized: 'nhóm rồng vàng',
    members: [makeMember()],
    status: 'SUBMITTED',
    createdAt: '2024-09-01T08:00:00.000Z',
    ...overrides,
  };
}

/**
 * Lượt chấm đã hoàn tất, không cần review. Các test về trạng thái khác chỉ
 * cần ghi đè đúng field liên quan (`status`, `needsReview`, `reviewStatus`...).
 */
export function makeGradingResult(overrides: Partial<GradingResult> = {}): GradingResult {
  return {
    teamId: 't-1',
    gradingAttemptId: 'g-1',
    status: 'GRADED',
    score: 85,
    aiFeedback: 'Bài làm đáp ứng phần lớn yêu cầu của rubric.',
    gradedAt: '2024-09-02T10:00:00.000Z',
    gradedBy: 'AI',
    needsReview: false,
    reviewStatus: 'NOT_REQUIRED',
    idempotencyKey: 'idem-1',
    triggeredBy: 'admin',
    rubricVersion: 1,
    ...overrides,
  };
}
