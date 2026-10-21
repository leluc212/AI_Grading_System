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
 *   - createTeamAndSubmit(input)             -> POST  /api/submissions + S3 POST + POST /api/submissions/:sid/finalize
 *   - resubmitTeamFiles(teamId, md, xml)     -> POST  /api/teams/:teamId/resubmit (multipart)
 *   - unlockResubmission(teamId, adminId)    -> PATCH /api/teams/:teamId/unlock   (JSON)
 *   - getTeamFiles(teamId)                   -> GET   /api/teams/:teamId/files
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import type {
  CreateSubmissionResponse,
  FinalizeSubmissionResponse,
  PresignedPost,
  SubmissionFile,
  Team,
  TeamMember,
  TeamStatus,
} from '@quick-grading/shared-types';
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
   * Nộp bài cho 1 nhóm trong 2 bước (tạo phiên upload -> tải file lên presigned S3 -> finalize).
   *
   * Flow thực hiện:
   *   1. Gửi metadata qua `POST /api/submissions` nhận `submissionId` và 2 presigned POST upload URL.
   *   2. Tải 2 file (`.md` và `.xml`) lên URL tương ứng bằng `multipart/form-data` qua `fetch` trực tiếp
   *      (các field presigned gửi theo đúng thứ tự, field `file` đặt cuối cùng).
   *   3. Gọi `POST /api/submissions/:submissionId/finalize` để hoàn tất nộp bài và nhận kết quả.
   *
   * Nếu việc tải file lên S3 thất bại (network error hoặc HTTP không OK),
   * ném Error('Tải file lên thất bại, vui lòng thử lại.').
   *
   * Throws `TeamNameConflictError` | `AssignmentClosedError` | `ValidationError`
   * (đã được map sẵn ở `http.ts`).
   */
  async createTeamAndSubmit(input: {
    assignmentId: string;
    teamName: string;
    members: Omit<TeamMember, 'memberId'>[];
    mdFile: File;
    xmlFile: File;
  }): Promise<{ team: Team; files: SubmissionFile[]; resubmitted: boolean }> {
    const createRes = await apiFetchJson<CreateSubmissionResponse>('/api/submissions', 'POST', {
      assignmentId: input.assignmentId,
      teamName: input.teamName,
      members: input.members,
      files: {
        md: { fileName: input.mdFile.name, size: input.mdFile.size },
        xml: { fileName: input.xmlFile.name, size: input.xmlFile.size },
      },
    });

    const uploadFile = async (upload: PresignedPost, file: File): Promise<void> => {
      const formData = new FormData();
      for (const [key, value] of Object.entries(upload.fields)) {
        formData.append(key, value);
      }
      formData.append('file', file);

      let response: Response;
      try {
        response = await fetch(upload.url, {
          method: 'POST',
          body: formData,
        });
      } catch {
        throw new Error('Tải file lên thất bại, vui lòng thử lại.');
      }

      if (!response.ok) {
        throw new Error('Tải file lên thất bại, vui lòng thử lại.');
      }
    };

    await Promise.all([
      uploadFile(createRes.uploads.md, input.mdFile),
      uploadFile(createRes.uploads.xml, input.xmlFile),
    ]);

    return apiFetch<FinalizeSubmissionResponse>(
      `/api/submissions/${encodeURIComponent(createRes.submissionId)}/finalize`,
      { method: 'POST' },
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
