/**
 * Dữ liệu mẫu dùng chung cho test của `web-submitter`.
 *
 * Mỗi factory trả về object ĐẦY ĐỦ theo type ở `@quick-grading/shared-types`
 * và cho phép ghi đè từng field — nhờ vậy mỗi test chỉ cần nêu đúng phần
 * khác biệt mà nó quan tâm (ví dụ `status: 'CLOSED'`), phần còn lại không
 * nhiễu vào nội dung test.
 */
import type { AssignmentListItem, SubmissionFile, Team } from '@quick-grading/shared-types';

/**
 * Trả về `AssignmentListItem` (= `Assignment` + `submittedTeamCount`) chứ
 * không phải `Assignment`, vì `assignmentsApi.listAssignments()` trả shape
 * giàu hơn đó. Vì `AssignmentListItem extends Assignment`, cùng 1 factory
 * dùng được cho cả `listAssignments` và `getAssignment`.
 */
export function makeAssignment(overrides: Partial<AssignmentListItem> = {}): AssignmentListItem {
  return {
    assignmentId: 'a1111111-1111-4111-8111-111111111111',
    assignmentName: 'Đợt 1 - Lập trình Web - K21',
    status: 'OPEN',
    createdAt: '2024-09-01T08:00:00.000Z',
    createdBy: 'admin',
    submittedTeamCount: 0,
    ...overrides,
  };
}

export function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    teamId: 't1111111-1111-4111-8111-111111111111',
    assignmentId: 'a1111111-1111-4111-8111-111111111111',
    teamName: 'Nhóm Rồng Vàng',
    teamNameNormalized: 'nhóm rồng vàng',
    members: [
      {
        memberId: 'm1111111-1111-4111-8111-111111111111',
        memberName: 'Nguyễn Văn An',
        email: 'an.nguyen@example.com',
        studentCode: 'SV001',
      },
    ],
    status: 'SUBMITTED',
    createdAt: '2024-09-01T08:00:00.000Z',
    ...overrides,
  };
}

export function makeSubmissionFile(overrides: Partial<SubmissionFile> = {}): SubmissionFile {
  return {
    teamId: 't1111111-1111-4111-8111-111111111111',
    fileType: 'md',
    fileName: 'bai-lam.md',
    s3Key: 'mock/t1111111-1111-4111-8111-111111111111/bai-lam.md',
    submittedAt: '2024-09-01T08:00:00.000Z',
    isLatest: true,
    ...overrides,
  };
}

/**
 * Tạo 1 `File` giả cho test upload.
 *
 * `size` được ghi đè bằng `defineProperty` thay vì tạo nội dung thật dài: để
 * test được ngưỡng 5MB mà không phải cấp phát 5MB chuỗi trong mỗi test case.
 * `File.size` là thuộc tính chỉ-đọc nên đây là cách duy nhất gọn gàng.
 */
export function makeFile(name: string, sizeBytes = 16): File {
  const file = new File(['noi dung gia'], name);
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}
