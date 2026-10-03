/**
 * MSW handler cho `unlockResubmission` và `resubmitTeamFiles` (task 3.6) —
 * luồng mở khoá nộp lại của Admin và nộp lại file của Submitter cho 1 Team
 * đã tồn tại.
 *
 * Endpoint tương ứng design.md > API Contract (Service Layer):
 *   - PATCH /api/teams/:teamId/unlock   -> unlockResubmission(teamId, adminId)
 *   - POST  /api/teams/:teamId/resubmit -> resubmitTeamFiles(teamId, mdFile, xmlFile)
 *
 * `unlockResubmission` là hành động Admin-only (Requirement 8.2), nhưng mock
 * auth thật (task 3.11) chưa tồn tại — handler chỉ nhận `adminId` trong body
 * và ghi nhận lại, KHÔNG enforce việc adminId đó có hợp lệ/đã đăng nhập hay
 * không. Việc chặn theo trạng thái Team (`SUBMITTED` -> `RESUBMISSION_ALLOWED`)
 * thì luôn được enforce ở server, không phụ thuộc UI chỉ hiện nút khi phù hợp.
 *
 * Lỗi trả về theo format `{ code, message }` (xem design.md > Error
 * Handling), tái dùng trực tiếp typed error class ở `shared-types`.
 *
 * _Requirements: 2.14, 8.1, 8.2, 8.3_
 */
import { http, HttpResponse } from 'msw';
import type { SubmissionFile } from '@quick-grading/shared-types';
import { DomainError, NotFoundError, ValidationError } from '@quick-grading/shared-types';
import { getDb, saveDb } from '../db.js';
import { buildS3Key, validateFile } from './submissions.js';

/** Chuyển 1 typed `DomainError` thành response `{ code, message }` đúng httpStatus của nó */
function errorResponse(error: DomainError) {
  return HttpResponse.json(
    { code: error.code, message: error.message },
    { status: error.httpStatus },
  );
}

export const resubmissionHandlers = [
  // PATCH /api/teams/:teamId/unlock — Requirement 8.1, 8.2
  http.patch('/api/teams/:teamId/unlock', async ({ params, request }) => {
    const teamId = params.teamId as string;

    const team = getDb().teams.find((t) => t.teamId === teamId);
    if (!team) {
      return errorResponse(new NotFoundError('Team', teamId));
    }

    const body = await request.json().catch(() => null);
    const adminId = (body as { adminId?: unknown } | null)?.adminId;
    if (typeof adminId !== 'string' || adminId.trim().length === 0) {
      return errorResponse(new ValidationError('Thiếu adminId.', 'adminId'));
    }

    // Requirement 8.1: chỉ mở khoá được nhóm đang SUBMITTED — mock handler
    // vẫn phải tự enforce điều này ở server, không dựa vào việc UI chỉ hiện
    // nút "Mở khoá nộp lại" khi team đang SUBMITTED (task 9.4 chỉ là UX,
    // không phải nguồn sự thật cuối cùng).
    if (team.status !== 'SUBMITTED') {
      return errorResponse(
        new ValidationError(
          `Chỉ có thể mở khoá nộp lại cho nhóm đang ở trạng thái SUBMITTED (nhóm hiện tại: ${team.status}).`,
          'status',
        ),
      );
    }

    team.status = 'RESUBMISSION_ALLOWED';
    team.unlockedBy = adminId.trim();
    team.unlockedAt = new Date().toISOString();
    saveDb();

    return HttpResponse.json(team, { status: 200 });
  }),

  // POST /api/teams/:teamId/resubmit — Requirement 2.14, 8.3
  //
  // multipart/form-data, field `mdFile` + `xmlFile` — không cần
  // assignmentId/teamName/members vì đang nộp lại cho đúng 1 Team đã tồn tại.
  http.post('/api/teams/:teamId/resubmit', async ({ params, request }) => {
    const teamId = params.teamId as string;

    const team = getDb().teams.find((t) => t.teamId === teamId);
    if (!team) {
      return errorResponse(new NotFoundError('Team', teamId));
    }

    // Requirement 2.14, 8.3: chỉ nộp lại được khi nhóm đang RESUBMISSION_ALLOWED.
    if (team.status !== 'RESUBMISSION_ALLOWED') {
      return errorResponse(
        new ValidationError(
          `Nhóm chưa được Admin mở khoá nộp lại (trạng thái hiện tại: ${team.status}).`,
          'status',
        ),
      );
    }

    const formData = await request.formData().catch(() => null);
    if (formData === null) {
      return errorResponse(
        new ValidationError('Request body không đúng định dạng multipart/form-data.'),
      );
    }

    // Validate 2 file bằng đúng logic dùng ở `createTeamAndSubmit` (task
    // 3.5, export từ `submissions.ts`) — tránh 2 bản copy lệch nhau của
    // cùng 1 quy tắc quan trọng (đúng phần mở rộng, ≤5MB, đúng 1 file/loại).
    const mdResult = validateFile(
      formData.get('mdFile'),
      formData.getAll('mdFile'),
      'mdFile',
      '.md',
    );
    if ('error' in mdResult) {
      return errorResponse(mdResult.error);
    }
    const xmlResult = validateFile(
      formData.get('xmlFile'),
      formData.getAll('xmlFile'),
      'xmlFile',
      '.xml',
    );
    if ('error' in xmlResult) {
      return errorResponse(xmlResult.error);
    }
    const { file: mdFile } = mdResult;
    const { file: xmlFile } = xmlResult;

    // --- Build toàn bộ thay đổi trong biến local trước, commit 1 lần duy
    // nhất ở cuối (cùng nguyên tắc atomic-commit với `submissions.ts`).
    const now = new Date().toISOString();

    const newFiles: SubmissionFile[] = [
      {
        teamId,
        fileType: 'md',
        fileName: mdFile.name,
        s3Key: buildS3Key(teamId, mdFile),
        submittedAt: now,
        isLatest: true,
      },
      {
        teamId,
        fileType: 'xml',
        fileName: xmlFile.name,
        s3Key: buildS3Key(teamId, xmlFile),
        submittedAt: now,
        isLatest: true,
      },
    ];

    // Property 4 (design.md): không xoá/ghi đè lịch sử nộp bài cũ — chỉ
    // đánh dấu `isLatest = false` cho các bản ghi cũ của đúng team này, rồi
    // thêm 2 bản ghi mới với `isLatest = true`.
    for (const file of getDb().submissionFiles) {
      if (file.teamId === teamId) {
        file.isLatest = false;
      }
    }
    getDb().submissionFiles.push(...newFiles);

    // Requirement 2.14: nộp lại thành công -> chuyển team về SUBMITTED.
    team.status = 'SUBMITTED';

    saveDb();

    return HttpResponse.json(newFiles, { status: 201 });
  }),
];
