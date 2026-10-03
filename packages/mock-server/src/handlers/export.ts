/**
 * MSW handler cho domain Export (task 3.10) — trả về dữ liệu thô cần xuất
 * cho 1 Assignment, để task 11.1/11.2 (web-admin) build file `.xlsx` thật
 * ở phía client (`exportAssignmentToExcel` trong design.md > API Contract
 * chỉ là hàm service layer FINAL, trả `Promise<Blob>` sau khi client tự
 * build workbook — handler này KHÔNG trả file nhị phân, chỉ trả JSON dữ
 * liệu nguồn).
 *
 * Endpoint:
 *   - GET /api/assignments/:assignmentId/export-data
 *
 * Lỗi trả về theo format `{ code, message }` (xem design.md > Error
 * Handling), tái dùng trực tiếp typed error class ở `shared-types`.
 *
 * _Requirements: 10.1, 10.2, 10.3_
 */
import { http, HttpResponse } from 'msw';
import type { GradingResult, ReviewStatus } from '@quick-grading/shared-types';
import { NotFoundError } from '@quick-grading/shared-types';
import { getDb } from '../db.js';

/** Chuyển 1 typed `DomainError` thành response `{ code, message }` đúng httpStatus của nó */
function errorResponse(error: NotFoundError) {
  return HttpResponse.json(
    { code: error.code, message: error.message },
    { status: error.httpStatus },
  );
}

/** Thông tin thành viên tối thiểu cần cho export — Requirement 10.2 ("tên và MSSV") */
interface ExportMember {
  memberName: string;
  studentCode?: string;
}

/** Literal dùng khi nhóm chưa được chấm (hoặc lượt chấm gần nhất chưa GRADED) — Requirement 10.3 */
const NOT_GRADED_LABEL = 'CHƯA CHẤM' as const;

/** 1 dòng dữ liệu export ứng với 1 Team, đúng tối thiểu các cột ở Requirement 10.2 */
interface ExportRow {
  teamName: string;
  members: ExportMember[];
  /** Requirement 7.6: finalScore ưu tiên nếu có, ngược lại score; Requirement 10.3: 'CHƯA CHẤM' nếu chưa có lượt chấm GRADED nào */
  finalDisplayScore: number | typeof NOT_GRADED_LABEL;
  reviewStatus: ReviewStatus | null;
  /** ISO timestamp của lượt chấm gần nhất, null nếu nhóm chưa từng được chấm */
  gradedAt: string | null;
}

interface ExportDataResponse {
  assignmentId: string;
  assignmentName: string;
  rows: ExportRow[];
}

/**
 * Lấy `GradingResult` gần nhất của 1 team, dựa trên thứ tự chèn vào mảng
 * `gradingResults` (chỉ `push`, không bao giờ splice/reorder — cùng quy
 * ước "array push order = chronological order" đã dùng ở
 * `grading.ts#listGradingHistory`).
 */
function getLatestGradingResult(
  teamId: string,
  gradingResults: GradingResult[],
): GradingResult | null {
  const teamResults = gradingResults.filter((g) => g.teamId === teamId);
  if (teamResults.length === 0) {
    return null;
  }
  return teamResults[teamResults.length - 1];
}

export const exportHandlers = [
  // GET /api/assignments/:assignmentId/export-data — Requirement 10.1, 10.2, 10.3
  http.get('/api/assignments/:assignmentId/export-data', ({ params }) => {
    const assignmentId = params.assignmentId as string;

    const assignment = getDb().assignments.find((a) => a.assignmentId === assignmentId);
    if (!assignment) {
      return errorResponse(new NotFoundError('Assignment', assignmentId));
    }

    const { teams, gradingResults } = getDb();
    const teamsInAssignment = teams.filter((t) => t.assignmentId === assignmentId);

    const rows: ExportRow[] = teamsInAssignment.map((team) => {
      const latest = getLatestGradingResult(team.teamId, gradingResults);

      // Requirement 10.3: chưa có lượt chấm nào, hoặc lượt gần nhất không
      // ở trạng thái GRADED (IN_PROGRESS/FAILED/PENDING) -> thể hiện rõ
      // "CHƯA CHẤM", không để trống/0 gây nhầm lẫn.
      const finalDisplayScore: ExportRow['finalDisplayScore'] =
        latest && latest.status === 'GRADED'
          ? (latest.finalScore ?? latest.score ?? NOT_GRADED_LABEL)
          : NOT_GRADED_LABEL;

      const row: ExportRow = {
        teamName: team.teamName,
        members: team.members.map((m) => ({
          memberName: m.memberName,
          studentCode: m.studentCode,
        })),
        finalDisplayScore,
        reviewStatus: latest?.reviewStatus ?? null,
        gradedAt: latest?.gradedAt ?? null,
      };
      return row;
    });

    const response: ExportDataResponse = {
      assignmentId: assignment.assignmentId,
      assignmentName: assignment.assignmentName,
      rows,
    };

    return HttpResponse.json(response, { status: 200 });
  }),
];
