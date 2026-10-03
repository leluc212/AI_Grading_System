/**
 * MSW handlers cho domain Team (phần list/get/check-name — task 3.4).
 *
 * Endpoint tương ứng các hàm service layer `teamsApi` mô tả ở design.md >
 * API Contract (Service Layer):
 *   - GET /api/assignments/:assignmentId/teams  -> listTeams(assignmentId, filter?)
 *   - GET /api/teams/:teamId                    -> getTeam(teamId)
 *   - GET /api/teams/check-name                 -> checkTeamNameAvailable(assignmentId, teamName)
 *
 * KHÔNG bao gồm `createTeamAndSubmit` (task 3.5) hay `resubmitTeamFiles` /
 * `unlockResubmission` (task 3.6) — các handler đó nằm ở file riêng theo
 * đúng task.
 *
 * Lỗi trả về theo format `{ code, message }` (xem design.md > Error
 * Handling), tái dùng trực tiếp typed error class ở `shared-types`.
 *
 * _Requirements: 2.13, 3.1_
 */
import { http, HttpResponse } from 'msw';
import type { Team, TeamStatus } from '@quick-grading/shared-types';
import { NotFoundError } from '@quick-grading/shared-types';
import { getDb } from '../db.js';

/** Chuyển 1 typed `DomainError` thành response `{ code, message }` đúng httpStatus của nó */
function errorResponse(error: NotFoundError) {
  return HttpResponse.json(
    { code: error.code, message: error.message },
    { status: error.httpStatus },
  );
}

const VALID_TEAM_STATUSES: TeamStatus[] = ['OPEN', 'SUBMITTED', 'RESUBMISSION_ALLOWED'];

/** Chuẩn hoá tên nhóm để so khớp (lowercase + trim) — giống logic seed ở `db.ts` */
function normalizeTeamName(teamName: string): string {
  return teamName.trim().toLowerCase();
}

export const teamHandlers = [
  // GET /api/assignments/:assignmentId/teams?status=... — Requirement 5.1, 5.2
  // Lưu ý: nếu assignmentId không tồn tại, handler trả về mảng RỖNG thay vì
  // 404 — 1 list endpoint trả rỗng cho scope không tồn tại là quy ước phổ
  // biến hơn (và design.md > API Contract không yêu cầu rõ hành vi 404 ở
  // đây), nên chọn phương án đơn giản này thay vì gây lỗi cho UI khi chưa
  // có nhóm nào.
  http.get('/api/assignments/:assignmentId/teams', ({ params, request }) => {
    const assignmentId = params.assignmentId as string;
    const url = new URL(request.url);
    const statusParam = url.searchParams.get('status');

    let teams: Team[] = getDb().teams.filter((team) => team.assignmentId === assignmentId);

    if (statusParam !== null) {
      // Bỏ qua giá trị status không hợp lệ (coi như không filter) — tránh
      // 400 cho 1 query param optional, việc validate chặt hơn thuộc UI.
      if (VALID_TEAM_STATUSES.includes(statusParam as TeamStatus)) {
        teams = teams.filter((team) => team.status === statusParam);
      }
    }

    return HttpResponse.json(teams, { status: 200 });
  }),

  // GET /api/teams/check-name?assignmentId=...&teamName=... — Requirement 2.13, 3.1
  //
  // Đăng ký TRƯỚC `/api/teams/:teamId` để MSW match đúng route tĩnh
  // `check-name` thay vì hiểu nhầm nó là 1 `:teamId`.
  //
  // Quy tắc nghiệp vụ (Requirement 2.12): tên nhóm chỉ thực sự bị "chặn"
  // khi nhóm trùng tên đang ở trạng thái SUBMITTED. Nếu nhóm trùng tên đang
  // ở OPEN (chưa từng nộp) hoặc RESUBMISSION_ALLOWED (đã được Admin mở khoá
  // nộp lại), thì tên đó vẫn coi là "available" ở endpoint check này — vì
  // luồng nộp lại (resubmit) tác động lên đúng team hiện có, không phải tạo
  // team mới trùng tên. Việc chặn tuyệt đối khi tạo mới đồng thời (race
  // condition, Requirement 3.1) là trách nhiệm atomic của handler
  // `createTeamAndSubmit` (task 3.5), không phải của endpoint check-name
  // này (endpoint này chỉ là gợi ý UX, không phải nguồn sự thật cuối cùng).
  http.get('/api/teams/check-name', ({ request }) => {
    const url = new URL(request.url);
    const assignmentId = url.searchParams.get('assignmentId') ?? '';
    const teamName = url.searchParams.get('teamName') ?? '';
    const normalized = normalizeTeamName(teamName);

    const conflictingTeam = getDb().teams.find(
      (team) =>
        team.assignmentId === assignmentId &&
        team.teamNameNormalized === normalized &&
        team.status === 'SUBMITTED',
    );

    return HttpResponse.json({ available: !conflictingTeam }, { status: 200 });
  }),

  // GET /api/teams/:teamId
  http.get('/api/teams/:teamId', ({ params }) => {
    const teamId = params.teamId as string;
    const team = getDb().teams.find((t) => t.teamId === teamId);
    if (!team) {
      return errorResponse(new NotFoundError('Team', teamId));
    }
    return HttpResponse.json(team, { status: 200 });
  }),
];
