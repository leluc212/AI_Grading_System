/**
 * Service layer cho domain Team (`teamsApi`).
 *
 * Signature các hàm bám sát design.md > API Contract (Service Layer). Mỗi
 * hàm gọi `fetch` tới đúng endpoint mà các mock handler đăng ký intercept
 * (xem từng hàm bên dưới). Lỗi HTTP được `http.ts` map sẵn sang typed error
 * class nên caller chỉ cần `try/catch` theo `instanceof`.
 *
 * Ánh xạ hàm -> endpoint (verified theo handler thật trong
 * `packages/mock-server/src/handlers/`):
 *   - listTeams(assignmentId, filter?)      -> GET   /api/assignments/:assignmentId/teams?status=
 *   - getTeam(teamId)                        -> GET   /api/teams/:teamId
 *   - checkTeamNameAvailable(aId, name)      -> GET   /api/teams/check-name?assignmentId=&teamName=
 *   - createTeamAndSubmit(input)             -> POST  /api/teams/submit          (multipart)
 *   - resubmitTeamFiles(teamId, md, xml)     -> POST  /api/teams/:teamId/resubmit (multipart)
 *   - unlockResubmission(teamId, adminId)    -> PATCH /api/teams/:teamId/unlock   (JSON)
 *   - getTeamFiles(teamId)                   -> GET   /api/teams/:teamId/files
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import type { SubmissionFile, Team, TeamMember, TeamStatus } from '@quick-grading/shared-types';
import { apiFetch, apiFetchFormData, apiFetchJson, buildQuery } from './http.js';

export const teamsApi = {
  /**
   * Liệt kê Team thuộc 1 Assignment, tuỳ chọn lọc theo trạng thái.
   * Khi có `filter.status`, thêm query `?status=...` (handler tự bỏ qua
   * giá trị status không hợp lệ, coi như không lọc).
   */
  listTeams(assignmentId: string, filter?: { status?: TeamStatus }): Promise<Team[]> {
    const query = buildQuery({ status: filter?.status });
    return apiFetch<Team[]>(`/api/assignments/${encodeURIComponent(assignmentId)}/teams${query}`);
  },

  /** Lấy chi tiết 1 Team theo id. Ném `NotFoundError` nếu không tồn tại. */
  getTeam(teamId: string): Promise<Team> {
    return apiFetch<Team>(`/api/teams/${encodeURIComponent(teamId)}`);
  },

  /**
   * Kiểm tra tên nhóm còn trống trong 1 Assignment hay không (gợi ý UX —
   * nguồn sự thật cuối cùng vẫn là `createTeamAndSubmit`). Tên chỉ bị coi là
   * "đã dùng" khi có nhóm trùng tên đang `SUBMITTED`.
   */
  checkTeamNameAvailable(assignmentId: string, teamName: string): Promise<{ available: boolean }> {
    const query = buildQuery({ assignmentId, teamName });
    return apiFetch<{ available: boolean }>(`/api/teams/check-name${query}`);
  },

  /**
   * Nộp bài cho 1 nhóm trong 1 request (2 file `.md` + `.xml`).
   *
   * Handler thật (`submissions.ts`) nhận `multipart/form-data` với các field:
   *   - `assignmentId`: string
   *   - `teamName`: string
   *   - `members`: string (JSON-stringified `Omit<TeamMember, 'memberId'>[]`)
   *   - `mdFile`: File (`.md`)
   *   - `xmlFile`: File (`.xml`)
   * nên hàm này gói input thành `FormData` đúng các field trên.
   *
   * ## Hàm này lo CẢ nộp lần đầu và nộp lại
   *
   * Server tra nhóm theo `assignmentId` + tên đã chuẩn hoá rồi xử theo trạng
   * thái: chưa có nhóm -> tạo mới (HTTP 201); nhóm đang `RESUBMISSION_ALLOWED`
   * (Admin đã mở khoá) hoặc `OPEN` (chưa từng nộp) -> nộp vào ĐÚNG nhóm đó
   * (HTTP 200, `resubmitted: true`); nhóm đang `SUBMITTED` -> ném
   * `TeamNameConflictError`.
   *
   * Lý do gộp: Submitter chỉ biết TÊN nhóm, không biết `teamId` mà
   * `resubmitTeamFiles` cần. Nếu tách thì phải có endpoint tra `teamId` theo
   * tên, mà endpoint đó sẽ để khu vực public đọc được dữ liệu nhóm khác
   * (Requirement 11.1). Gộp vào đây cũng là thứ giữ được Property 1: không
   * bao giờ tạo thêm nhóm trùng tên trong cùng assignment.
   *
   * `resubmitted` cho biết request vừa rồi là nộp lại hay nộp lần đầu, để UI
   * hiển thị đúng thông báo.
   *
   * Throws `TeamNameConflictError` | `AssignmentClosedError` | `ValidationError`
   * (đã được map sẵn ở `http.ts`).
   */
  createTeamAndSubmit(input: {
    assignmentId: string;
    teamName: string;
    members: Omit<TeamMember, 'memberId'>[];
    mdFile: File;
    xmlFile: File;
  }): Promise<{ team: Team; files: SubmissionFile[]; resubmitted: boolean }> {
    const formData = new FormData();
    formData.append('assignmentId', input.assignmentId);
    formData.append('teamName', input.teamName);
    formData.append('members', JSON.stringify(input.members));
    formData.append('mdFile', input.mdFile);
    formData.append('xmlFile', input.xmlFile);
    return apiFetchFormData<{ team: Team; files: SubmissionFile[]; resubmitted: boolean }>(
      '/api/teams/submit',
      'POST',
      formData,
    );
  },

  /**
   * Nộp lại 2 file cho 1 Team đang `RESUBMISSION_ALLOWED`.
   *
   * Handler thật (`resubmission.ts`) nhận `multipart/form-data` chỉ với 2
   * field `mdFile` + `xmlFile` (không cần assignmentId/teamName/members vì
   * nộp lại cho đúng Team đã tồn tại). Trả HTTP 201 kèm mảng
   * `SubmissionFile[]` mới (đã đánh dấu `isLatest`).
   */
  resubmitTeamFiles(teamId: string, mdFile: File, xmlFile: File): Promise<SubmissionFile[]> {
    const formData = new FormData();
    formData.append('mdFile', mdFile);
    formData.append('xmlFile', xmlFile);
    return apiFetchFormData<SubmissionFile[]>(
      `/api/teams/${encodeURIComponent(teamId)}/resubmit`,
      'POST',
      formData,
    );
  },

  /**
   * Mở khoá nộp lại cho 1 Team đang `SUBMITTED` (hành động Admin-only).
   *
   * Handler thật (`resubmission.ts`) nhận body JSON `{ adminId }` (PATCH),
   * trả về Team đã chuyển sang `RESUBMISSION_ALLOWED`.
   */
  unlockResubmission(teamId: string, adminId: string): Promise<Team> {
    return apiFetchJson<Team>(`/api/teams/${encodeURIComponent(teamId)}/unlock`, 'PATCH', {
      adminId,
    });
  },

  /**
   * Lấy NỘI DUNG (không phải metadata) của 2 file mới nhất của 1 Team để
   * trang Admin render trực tiếp.
   *
   * Handler thật (`team-files.ts`) trả `{ md: string; xml: string }`. Ném
   * `NotFoundError` nếu Team không tồn tại, `ValidationError` nếu chưa nộp
   * đủ 2 file.
   */
  getTeamFiles(teamId: string): Promise<{ md: string; xml: string }> {
    return apiFetch<{ md: string; xml: string }>(`/api/teams/${encodeURIComponent(teamId)}/files`);
  },
};
