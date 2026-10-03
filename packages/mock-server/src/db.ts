/**
 * Mock data store cho giai đoạn 1.
 *
 * 1 object in-memory duy nhất giữ toàn bộ "bảng" dữ liệu (tương đương các
 * DynamoDB table ở giai đoạn 2), được seed sẵn vài Assignment/Team mẫu và
 * persist qua `localStorage` để refresh trang không mất data khi demo.
 *
 * Các handler (task 3.3 - 3.11) đọc/ghi trực tiếp lên object trả về từ
 * `getDb()` rồi gọi `saveDb()` để persist — file này KHÔNG chứa business
 * logic (check trùng tên, validate, v.v), đó là việc của handler.
 *
 * See design.md > Mock Server Design (Giai đoạn 1).
 */
import type { Assignment } from '@quick-grading/shared-types';
import type { GradingResult } from '@quick-grading/shared-types';
import type { Rubric } from '@quick-grading/shared-types';
import type { SubmissionFile } from '@quick-grading/shared-types';
import type { Team } from '@quick-grading/shared-types';

/** Toàn bộ "bảng" dữ liệu mock, tương đương các DynamoDB table ở giai đoạn 2 */
export interface MockDb {
  assignments: Assignment[];
  teams: Team[];
  submissionFiles: SubmissionFile[];
  gradingResults: GradingResult[];
  rubrics: Rubric[];
}

/** Key duy nhất dùng để persist toàn bộ store vào `localStorage` */
const STORAGE_KEY = 'quick-grading-mock-db';

/** Chuẩn hoá tên nhóm để so khớp (lowercase + trim), giống logic ở handler thật */
function normalizeTeamName(teamName: string): string {
  return teamName.trim().toLowerCase();
}

/**
 * Dữ liệu seed ban đầu: 2 Assignment (1 OPEN, 1 CLOSED) và 4 Team trải qua
 * các trạng thái khác nhau, để có sẵn dữ liệu demo mà không cần nộp bài thật.
 *
 * Lưu ý: `submissionFiles` seed chỉ chứa metadata giả (không có blob nội
 * dung thật, vì giai đoạn seed không có `File` object) — đủ để dashboard
 * Admin hiển thị "đã nộp 2 file"; `gradingResults` để trống vì việc tạo
 * lượt chấm là hành động của handler `triggerGrading` (task 3.8), không cần
 * seed sẵn.
 */
function createSeedDb(): MockDb {
  const now = new Date('2024-09-01T08:00:00.000Z').toISOString();

  const assignments: Assignment[] = [
    {
      assignmentId: 'a1111111-1111-4111-8111-111111111111',
      assignmentName: 'Đợt 1 - Lập trình Web - K21',
      status: 'OPEN',
      createdAt: now,
      createdBy: 'admin',
    },
    {
      assignmentId: 'a2222222-2222-4222-8222-222222222222',
      assignmentName: 'Đợt 2 - Cấu trúc dữ liệu - K20',
      status: 'CLOSED',
      createdAt: now,
      createdBy: 'admin',
    },
  ];

  const teams: Team[] = [
    // Đã nộp bài đầy đủ, thuộc assignment đang OPEN.
    {
      teamId: 't1111111-1111-4111-8111-111111111111',
      assignmentId: assignments[0].assignmentId,
      teamName: 'Nhóm Rồng Vàng',
      teamNameNormalized: normalizeTeamName('Nhóm Rồng Vàng'),
      members: [
        {
          memberId: 'm1111111-1111-4111-8111-111111111111',
          memberName: 'Nguyễn Văn An',
          email: 'an.nguyen@example.com',
          studentCode: 'SV001',
        },
        {
          memberId: 'm1111111-1111-4111-8111-111111111112',
          memberName: 'Trần Thị Bình',
          email: 'binh.tran@example.com',
          studentCode: 'SV002',
        },
      ],
      status: 'SUBMITTED',
      createdAt: now,
      createdBy: undefined,
    },
    // Chưa nộp bài (trạng thái OPEN) — minh hoạ nhóm mới tạo, chưa có file.
    {
      teamId: 't2222222-2222-4222-8222-222222222222',
      assignmentId: assignments[0].assignmentId,
      teamName: 'Nhóm Phượng Hoàng',
      teamNameNormalized: normalizeTeamName('Nhóm Phượng Hoàng'),
      members: [
        {
          memberId: 'm2222222-2222-4222-8222-222222222221',
          memberName: 'Lê Minh Châu',
          email: 'chau.le@example.com',
        },
      ],
      status: 'OPEN',
      createdAt: now,
      createdBy: undefined,
    },
    // Đã nộp rồi nhưng Admin mở khoá cho nộp lại (RESUBMISSION_ALLOWED).
    {
      teamId: 't3333333-3333-4333-8333-333333333333',
      assignmentId: assignments[0].assignmentId,
      teamName: 'Nhóm Sao Băng',
      teamNameNormalized: normalizeTeamName('Nhóm Sao Băng'),
      members: [
        {
          memberId: 'm3333333-3333-4333-8333-333333333331',
          memberName: 'Phạm Quốc Duy',
          email: 'duy.pham@example.com',
          studentCode: 'SV003',
        },
        {
          memberId: 'm3333333-3333-4333-8333-333333333332',
          memberName: 'Hoàng Thị Em',
          email: 'em.hoang@example.com',
          studentCode: 'SV004',
        },
      ],
      status: 'RESUBMISSION_ALLOWED',
      createdAt: now,
      createdBy: undefined,
      unlockedBy: 'admin',
      unlockedAt: now,
    },
    // Đã nộp bài, thuộc assignment đã CLOSED — minh hoạ dữ liệu đợt cũ.
    {
      teamId: 't4444444-4444-4444-8444-444444444444',
      assignmentId: assignments[1].assignmentId,
      teamName: 'Nhóm Đại Bàng',
      teamNameNormalized: normalizeTeamName('Nhóm Đại Bàng'),
      members: [
        {
          memberId: 'm4444444-4444-4444-8444-444444444441',
          memberName: 'Vũ Thanh Phong',
          email: 'phong.vu@example.com',
          studentCode: 'SV005',
        },
      ],
      status: 'SUBMITTED',
      createdAt: now,
      createdBy: undefined,
    },
  ];

  const submissionFiles: SubmissionFile[] = [
    // File của "Nhóm Rồng Vàng" (team 1) — bản nộp hiện tại.
    {
      teamId: teams[0].teamId,
      fileType: 'md',
      fileName: 'bai-lam.md',
      s3Key: `mock/${teams[0].teamId}/bai-lam.md`,
      submittedAt: now,
      isLatest: true,
    },
    {
      teamId: teams[0].teamId,
      fileType: 'xml',
      fileName: 'bai-lam.xml',
      s3Key: `mock/${teams[0].teamId}/bai-lam.xml`,
      submittedAt: now,
      isLatest: true,
    },
    // File cũ của "Nhóm Sao Băng" (team 3) — không xoá khi mở khoá nộp lại,
    // chỉ đánh dấu isLatest = false (Property 4 trong design.md).
    {
      teamId: teams[2].teamId,
      fileType: 'md',
      fileName: 'bai-lam-v1.md',
      s3Key: `mock/${teams[2].teamId}/bai-lam-v1.md`,
      submittedAt: now,
      isLatest: false,
    },
    {
      teamId: teams[2].teamId,
      fileType: 'xml',
      fileName: 'bai-lam-v1.xml',
      s3Key: `mock/${teams[2].teamId}/bai-lam-v1.xml`,
      submittedAt: now,
      isLatest: false,
    },
    // File của "Nhóm Đại Bàng" (team 4).
    {
      teamId: teams[3].teamId,
      fileType: 'md',
      fileName: 'bai-lam.md',
      s3Key: `mock/${teams[3].teamId}/bai-lam.md`,
      submittedAt: now,
      isLatest: true,
    },
    {
      teamId: teams[3].teamId,
      fileType: 'xml',
      fileName: 'bai-lam.xml',
      s3Key: `mock/${teams[3].teamId}/bai-lam.xml`,
      submittedAt: now,
      isLatest: true,
    },
  ];

  // Chưa seed GradingResult nào — lượt chấm chỉ được tạo khi Admin trigger
  // chấm bài (handler task 3.8), không cần dữ liệu giả ở đây.
  const gradingResults: GradingResult[] = [];

  // 1 rubric tối thiểu, đang active, để handler `getActiveRubric` (task 3.9)
  // có dữ liệu ngay khi chưa có ai cấu hình lại.
  const rubrics: Rubric[] = [
    {
      rubricId: 'r1111111-1111-4111-8111-111111111111',
      version: 1,
      criteria: [
        { id: 'c1', label: 'Tính đúng đắn', weight: 60 },
        { id: 'c2', label: 'Chất lượng trình bày', weight: 40 },
      ],
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  return { assignments, teams, submissionFiles, gradingResults, rubrics };
}

/** True nếu `localStorage` khả dụng trong môi trường hiện tại (trình duyệt) */
function hasLocalStorage(): boolean {
  // `typeof` không throw dù `localStorage` chưa từng được declare (ví dụ
  // khi chạy trong Node/Vitest không có jsdom) — an toàn để check trước.
  if (typeof localStorage === 'undefined') {
    return false;
  }
  try {
    // Một số môi trường (ví dụ trình duyệt ở chế độ private/incognito bị
    // chặn storage) có `localStorage` tồn tại nhưng truy cập sẽ throw.
    const testKey = '__quick_grading_mock_db_probe__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/** Đọc store từ `localStorage` nếu có và hợp lệ, ngược lại dùng seed data */
function loadDb(): MockDb {
  if (hasLocalStorage()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw) as MockDb;
      }
    } catch {
      // Dữ liệu trong localStorage bị hỏng/không parse được — bỏ qua và
      // fallback về seed data ở dưới.
    }
  }
  return createSeedDb();
}

let db: MockDb = loadDb();

/**
 * Lấy reference tới store hiện tại. Handler nên đọc/ghi trực tiếp lên các
 * array trả về từ hàm này (ví dụ `getDb().teams.push(newTeam)`), rồi gọi
 * `saveDb()` để persist thay đổi.
 */
export function getDb(): MockDb {
  return db;
}

/** Persist toàn bộ store hiện tại vào `localStorage` (no-op nếu không có localStorage) */
export function saveDb(): void {
  if (!hasLocalStorage()) {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Bỏ qua lỗi ghi (ví dụ hết quota) — mock store vẫn đúng trong memory,
    // chỉ mất khả năng persist qua lần refresh tiếp theo.
  }
}

/**
 * Khôi phục store về đúng seed data ban đầu và persist lại. Hữu ích cho
 * test (đảm bảo mỗi test bắt đầu từ trạng thái sạch) và cho việc demo (nút
 * "reset dữ liệu mẫu" nếu cần ở giai đoạn sau).
 */
export function resetMockDb(): MockDb {
  db = createSeedDb();
  saveDb();
  return db;
}
