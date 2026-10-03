/**
 * MSW handlers cho domain Assignment.
 *
 * Endpoint tương ứng các hàm service layer `assignmentsApi` mô tả ở
 * design.md > API Contract (Service Layer):
 *   - GET    /api/assignments             -> listAssignments()
 *   - GET    /api/assignments/:id         -> getAssignment(assignmentId)
 *   - POST   /api/assignments             -> createAssignment(input)
 *   - PATCH  /api/assignments/:id/status  -> setAssignmentStatus(assignmentId, status)
 *
 * Lỗi trả về theo format `{ code, message }` (xem design.md > Error
 * Handling), tái dùng trực tiếp typed error class ở `shared-types` để đảm
 * bảo `code`/`message`/`httpStatus` luôn khớp nhau.
 *
 * _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_
 */
import { http, HttpResponse } from 'msw';
import type { Assignment, AssignmentListItem, AssignmentStatus } from '@quick-grading/shared-types';
import { NotFoundError, ValidationError } from '@quick-grading/shared-types';
import { getDb, saveDb } from '../db.js';

/** Body chấp nhận khi tạo Assignment mới */
interface CreateAssignmentBody {
  assignmentName?: unknown;
  /** Chưa có mock auth thật (task 3.11) — cho phép truyền, nếu không sẽ dùng placeholder */
  createdBy?: unknown;
}

/** Body chấp nhận khi đổi trạng thái Assignment */
interface SetAssignmentStatusBody {
  status?: unknown;
}

/** Chuyển 1 typed `DomainError` thành response `{ code, message }` đúng httpStatus của nó */
function errorResponse(error: ValidationError | NotFoundError) {
  return HttpResponse.json(
    { code: error.code, message: error.message },
    { status: error.httpStatus },
  );
}

/**
 * Gắn `submittedTeamCount` vào 1 Assignment để thoả Requirement 1.3 (danh
 * sách phải hiển thị số nhóm đã nộp).
 *
 * Type `AssignmentListItem` nay nằm ở `@quick-grading/shared-types` để
 * api-client và UI dùng đúng cùng 1 định nghĩa (trước đây khai báo cục bộ ở
 * file này nên field bị ẩn khỏi type mà service layer trả về).
 */
function toListItem(assignment: Assignment): AssignmentListItem {
  const teams = getDb().teams.filter((team) => team.assignmentId === assignment.assignmentId);
  const submittedTeamCount = teams.filter(
    (team) => team.status === 'SUBMITTED' || team.status === 'RESUBMISSION_ALLOWED',
  ).length;
  return { ...assignment, submittedTeamCount };
}

const VALID_STATUSES: AssignmentStatus[] = ['OPEN', 'CLOSED'];

export const assignmentHandlers = [
  // GET /api/assignments — Requirement 1.3
  http.get('/api/assignments', () => {
    const items = getDb().assignments.map(toListItem);
    return HttpResponse.json(items, { status: 200 });
  }),

  // GET /api/assignments/:assignmentId
  http.get('/api/assignments/:assignmentId', ({ params }) => {
    const assignmentId = params.assignmentId as string;
    const assignment = getDb().assignments.find((a) => a.assignmentId === assignmentId);
    if (!assignment) {
      return errorResponse(new NotFoundError('Assignment', assignmentId));
    }
    return HttpResponse.json(assignment, { status: 200 });
  }),

  // POST /api/assignments — Requirement 1.1, 1.2
  http.post('/api/assignments', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as CreateAssignmentBody;
    const rawName = body.assignmentName;

    if (typeof rawName !== 'string' || rawName.trim().length === 0) {
      return errorResponse(
        new ValidationError('Tên Assignment không được để trống.', 'assignmentName'),
      );
    }

    const createdBy =
      typeof body.createdBy === 'string' && body.createdBy.trim().length > 0
        ? body.createdBy
        : 'admin';

    const assignment: Assignment = {
      assignmentId: crypto.randomUUID(),
      assignmentName: rawName.trim(),
      status: 'OPEN',
      createdAt: new Date().toISOString(),
      createdBy,
    };

    getDb().assignments.push(assignment);
    saveDb();

    return HttpResponse.json(assignment, { status: 201 });
  }),

  // PATCH /api/assignments/:assignmentId/status — Requirement 1.4, 1.5
  http.patch('/api/assignments/:assignmentId/status', async ({ params, request }) => {
    const assignmentId = params.assignmentId as string;
    const assignment = getDb().assignments.find((a) => a.assignmentId === assignmentId);
    if (!assignment) {
      return errorResponse(new NotFoundError('Assignment', assignmentId));
    }

    const body = (await request.json().catch(() => ({}))) as SetAssignmentStatusBody;
    const status = body.status;

    if (typeof status !== 'string' || !VALID_STATUSES.includes(status as AssignmentStatus)) {
      return errorResponse(
        new ValidationError(`status phải là 1 trong: ${VALID_STATUSES.join(', ')}.`, 'status'),
      );
    }

    assignment.status = status as AssignmentStatus;
    saveDb();

    return HttpResponse.json(assignment, { status: 200 });
  }),
];
