/**
 * MSW handler cho `createTeamAndSubmit` (task 3.5) — nộp bài lần đầu của 1
 * nhóm: tạo Team mới + 2 SubmissionFile (`.md` + `.xml`) trong 1 request.
 *
 * Endpoint tương ứng `teamsApi.createTeamAndSubmit` ở design.md > API
 * Contract (Service Layer):
 *   - POST /api/teams/submit -> createTeamAndSubmit(input)
 *
 * Request là `multipart/form-data` (Submitter upload file thật từ browser),
 * không phải JSON — field:
 *   - `assignmentId`: string
 *   - `teamName`: string
 *   - `members`: string (JSON-stringified `Omit<TeamMember, 'memberId'>[]`)
 *   - `mdFile`: File (`.md`)
 *   - `xmlFile`: File (`.xml`)
 *
 * KHÔNG dùng `POST /api/assignments/:assignmentId/teams` vì `assignmentId`
 * đã có sẵn trong body/form — 1 endpoint duy nhất `POST /api/teams/submit`
 * đơn giản hơn và khớp 1-1 với tên hàm service layer `createTeamAndSubmit`.
 *
 * Lỗi trả về theo format `{ code, message }` (xem design.md > Error
 * Handling), tái dùng trực tiếp typed error class ở `shared-types`.
 *
 * _Requirements: 1.7, 1.8, 2.1-2.13, 3.2, 11.3_
 */
import { http, HttpResponse } from 'msw';
import type { SubmissionFile, Team, TeamMember } from '@quick-grading/shared-types';
import {
  AssignmentClosedError,
  DomainError,
  NotFoundError,
  TeamNameConflictError,
  ValidationError,
} from '@quick-grading/shared-types';
import { getDb, saveDb } from '../db.js';

/** Chuyển 1 typed `DomainError` thành response `{ code, message }` đúng httpStatus của nó */
function errorResponse(error: DomainError) {
  return HttpResponse.json(
    { code: error.code, message: error.message },
    { status: error.httpStatus },
  );
}

/** Chuẩn hoá tên nhóm để so khớp (lowercase + trim) — giống logic ở `db.ts`/`teams.ts` */
function normalizeTeamName(teamName: string): string {
  return teamName.trim().toLowerCase();
}

/** Kích thước tối đa 1 file được nhận — Requirement 2.8, 11.3 */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Regex email "đủ tốt" cho mock — không cần RFC-đầy đủ, chỉ chặn input rõ sai định dạng */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shape 1 phần tử trong field `members` (JSON) sau khi parse, trước khi validate kỹ */
interface RawMember {
  memberName?: unknown;
  email?: unknown;
  studentCode?: unknown;
}

/** Parse + validate field `members` (JSON-stringified array). Trả về lỗi validate đầu tiên gặp phải, nếu có. */
function parseMembers(
  raw: string | null,
): { members: Omit<TeamMember, 'memberId'>[] } | { error: ValidationError } {
  if (raw === null || raw.trim().length === 0) {
    return { error: new ValidationError('Danh sách thành viên không được để trống.', 'members') };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      error: new ValidationError('Danh sách thành viên không đúng định dạng JSON.', 'members'),
    };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    // Requirement 2.3: tối thiểu 1 thành viên.
    return { error: new ValidationError('Nhóm phải có ít nhất 1 thành viên.', 'members') };
  }

  const members: Omit<TeamMember, 'memberId'>[] = [];
  for (const [index, item] of (parsed as RawMember[]).entries()) {
    const memberName = item?.memberName;
    const email = item?.email;
    const studentCode = item?.studentCode;

    if (typeof memberName !== 'string' || memberName.trim().length === 0) {
      return {
        error: new ValidationError(
          `Thành viên thứ ${index + 1}: tên sinh viên không được để trống.`,
          'members',
        ),
      };
    }
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email.trim())) {
      return {
        error: new ValidationError(
          `Thành viên thứ ${index + 1}: email không đúng định dạng.`,
          'members',
        ),
      };
    }
    if (studentCode !== undefined && typeof studentCode !== 'string') {
      return {
        error: new ValidationError(`Thành viên thứ ${index + 1}: MSSV không hợp lệ.`, 'members'),
      };
    }

    members.push({
      memberName: memberName.trim(),
      email: email.trim(),
      studentCode: studentCode && studentCode.trim().length > 0 ? studentCode.trim() : undefined,
    });
  }

  return { members };
}

/**
 * Validate 1 field file: đúng 1 file, đúng phần mở rộng, không vượt kích
 * thước tối đa.
 *
 * `export` vì logic validate file (loại + kích thước) là dùng chung y
 * nguyên giữa `createTeamAndSubmit` (task 3.5) và `resubmitTeamFiles` (task
 * 3.6, xem `resubmission.ts`) — tránh 2 bản copy lệch nhau của cùng 1 quy
 * tắc quan trọng (Requirement 2.6-2.8, 11.3).
 */
export function validateFile(
  file: FormDataEntryValue | null,
  allFilesForField: FormDataEntryValue[],
  fieldName: string,
  expectedExtension: string,
): { file: File } | { error: ValidationError } {
  if (allFilesForField.length > 1) {
    // Requirement 2.7: chọn nhiều hơn 1 file cho mỗi loại.
    return { error: new ValidationError(`Chỉ được chọn đúng 1 file cho ${fieldName}.`, fieldName) };
  }
  if (file === null || typeof file === 'string') {
    return {
      error: new ValidationError(`Thiếu file ${fieldName} (${expectedExtension}).`, fieldName),
    };
  }

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(expectedExtension)) {
    // Requirement 2.6, 2.7: chỉ chấp nhận đúng phần mở rộng tương ứng.
    return {
      error: new ValidationError(
        `File ${fieldName} phải có phần mở rộng ${expectedExtension}.`,
        fieldName,
      ),
    };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    // Requirement 2.8, 11.3: giới hạn kích thước tối đa 5MB/file.
    return {
      error: new ValidationError(`File ${fieldName} vượt quá kích thước tối đa 5MB.`, fieldName),
    };
  }

  return { file };
}

/**
 * Sinh "storage key" giả cho 1 file đã nộp.
 *
 * Ưu tiên `URL.createObjectURL(file)` (đúng theo design.md > Mock Server
 * Design — giữ tham chiếu blob trong session để trang Admin xem lại được
 * nội dung file). MSW handler chạy trong Service Worker/browser context nên
 * `URL.createObjectURL` thường sẵn có; tuy nhiên môi trường này không phải
 * luôn đảm bảo (ví dụ chạy handler trong test Node không có DOM), nên fallback
 * về 1 key giả dạng `mock/${teamId}/${fileName}` (giống format đã seed ở
 * `db.ts`) khi `URL.createObjectURL` không tồn tại hoặc gọi bị lỗi.
 *
 * `export` để `resubmission.ts` (task 3.6) tái dùng, giữ đúng 1 nguồn logic
 * sinh storage key cho toàn bộ luồng nộp bài (lần đầu + nộp lại).
 */
export function buildS3Key(teamId: string, file: File): string {
  if (typeof URL.createObjectURL === 'function') {
    try {
      return URL.createObjectURL(file);
    } catch {
      // Rơi xuống fallback dưới đây.
    }
  }
  return `mock/${teamId}/${file.name}`;
}

export const submissionHandlers = [
  // POST /api/teams/submit — Requirement 1.7, 1.8, 2.1-2.13, 3.2, 11.3
  http.post('/api/teams/submit', async ({ request }) => {
    // --- Bước 1: đọc toàn bộ FormData (async) trước khi làm bất kỳ check
    // đồng bộ nào. Toàn bộ phần còn lại của handler (từ đây tới khi
    // push/saveDb) chạy hoàn toàn đồng bộ — vì JS đơn luồng, không có
    // `await` nào chen giữa lúc check trùng tên và lúc commit, nên 2 request
    // gửi "đồng thời" tới cùng 1 tab/JS context vẫn được xử lý tuần tự,
    // không có khoảng hở race condition trong nội bộ 1 lần gọi handler này
    // (Requirement 3.1, Property 1 — xem thêm handler `teams.ts` check-name
    // vốn chỉ mang tính gợi ý UX, nguồn sự thật cuối cùng là ở đây).
    const formData = await request.formData().catch(() => null);
    if (formData === null) {
      return errorResponse(
        new ValidationError('Request body không đúng định dạng multipart/form-data.'),
      );
    }

    const assignmentIdRaw = formData.get('assignmentId');
    const teamNameRaw = formData.get('teamName');

    if (typeof assignmentIdRaw !== 'string' || assignmentIdRaw.trim().length === 0) {
      return errorResponse(new ValidationError('Thiếu assignmentId.', 'assignmentId'));
    }
    const assignmentId = assignmentIdRaw;

    if (typeof teamNameRaw !== 'string' || teamNameRaw.trim().length === 0) {
      // Requirement 2.1/2.5 area: tên nhóm là field bắt buộc của form.
      return errorResponse(new ValidationError('Tên nhóm không được để trống.', 'teamName'));
    }
    const teamName = teamNameRaw.trim();

    // --- Bước 2: Assignment phải tồn tại và đang OPEN (Requirement 1.7, 1.8) ---
    const assignment = getDb().assignments.find((a) => a.assignmentId === assignmentId);
    if (!assignment) {
      return errorResponse(new NotFoundError('Assignment', assignmentId));
    }
    if (assignment.status !== 'OPEN') {
      return errorResponse(new AssignmentClosedError(assignmentId));
    }

    // --- Bước 3: validate danh sách thành viên (Requirement 2.2, 2.3) ---
    const membersResult = parseMembers(formData.get('members') as string | null);
    if ('error' in membersResult) {
      return errorResponse(membersResult.error);
    }
    const { members } = membersResult;

    // --- Bước 4: validate đúng 2 file (Requirement 2.6, 2.7, 2.8, 11.3) ---
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

    // --- Bước 5: tra nhóm trùng tên trong cùng Assignment (Requirement
    // 2.9, 2.12, 2.13, 2.14, 3.1) ---
    //
    // Tìm theo tên ĐÃ CHUẨN HOÁ, KHÔNG lọc theo status. Đây là điểm then
    // chốt để giữ Property 1 (design.md): không bao giờ tồn tại 2 Team cùng
    // `assignmentId + teamNameNormalized`. Bản trước chỉ chặn khi nhóm trùng
    // tên đang `SUBMITTED`, nên sau khi Admin mở khoá nộp lại (nhóm chuyển
    // sang `RESUBMISSION_ALLOWED`), nhóm sinh viên nhập lại đúng tên cũ —
    // việc tự nhiên nhất họ làm — lại TẠO THÊM 1 nhóm trùng tên thay vì nộp
    // lại. Đó là lỗi vi phạm Property 1, đã được kiểm chứng.
    //
    // Xử lý theo status của nhóm tìm được:
    //   - `SUBMITTED`              -> từ chối, trùng tên (Requirement 2.12).
    //   - `RESUBMISSION_ALLOWED`   -> coi request này là NỘP LẠI cho đúng
    //                                 nhóm đó (Requirement 2.14). Nhờ vậy
    //                                 Submitter nộp lại được bằng cách nhập
    //                                 lại tên nhóm, KHÔNG cần endpoint tra
    //                                 `teamId` theo tên (vốn sẽ phải trả về
    //                                 dữ liệu nhóm khác cho khu vực public,
    //                                 vi phạm Requirement 11.1).
    //   - `OPEN`                   -> nhóm đã được tạo nhưng chưa từng nộp,
    //                                 nên đây là lần nộp đầu CỦA nhóm đó.
    const teamNameNormalized = normalizeTeamName(teamName);
    const existingTeam = getDb().teams.find(
      (team) =>
        team.assignmentId === assignmentId && team.teamNameNormalized === teamNameNormalized,
    );

    if (existingTeam?.status === 'SUBMITTED') {
      return errorResponse(new TeamNameConflictError(teamName, assignmentId));
    }

    // --- Bước 6: build toàn bộ record trong biến local trước, CHƯA ghi gì
    // vào db (Property 2 — atomicity). Nếu có exception ném ra ở bất kỳ
    // bước nào phía trên hoặc trong lúc build dưới đây, db vẫn giữ nguyên
    // trạng thái cũ — không có Team "nửa nộp" nào bị lưu lại. Trong 1 mock
    // handler đồng bộ (không có network call thật giữa việc lưu file A và
    // file B) không có cách nào tái hiện tự nhiên kịch bản "file .md ghi
    // thành công nhưng .xml thất bại"; cách xử lý thực tế ở đây là đảm bảo
    // KHÔNG có ghi từng phần: Team và cả 2 SubmissionFile chỉ được push vào
    // db + persist trong 1 bước cuối cùng duy nhất, sau khi toàn bộ dữ liệu
    // đã hợp lệ và sẵn sàng.
    //
    // Nộp lại thì dùng lại `teamId` cũ — đó chính là điều làm cho lịch sử
    // nộp bài và lịch sử chấm của nhóm không bị tách thành 2 nhóm rời rạc.
    const teamId = existingTeam?.teamId ?? crypto.randomUUID();
    const now = new Date().toISOString();

    const teamMembers: TeamMember[] = members.map((member) => ({
      ...member,
      memberId: crypto.randomUUID(),
    }));

    const files: SubmissionFile[] = [
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

    // --- Bước 7: commit — chỉ 1 bước ghi duy nhất, "cả 2 file ghi nhận
    // xong" mới set status SUBMITTED (Requirement 3.2).
    if (existingTeam) {
      // Property 4 (design.md): KHÔNG xoá bản ghi nộp bài cũ, chỉ hạ cờ
      // `isLatest` rồi thêm bản mới — giống hệt `resubmitTeamFiles`.
      for (const file of getDb().submissionFiles) {
        if (file.teamId === teamId) {
          file.isLatest = false;
        }
      }

      // Cập nhật danh sách thành viên theo đúng những gì Submitter vừa nhập.
      // Khác với `resubmitTeamFiles` (endpoint đó chỉ nhận 2 file nên giữ
      // nguyên thành viên cũ): ở đây Submitter VỪA điền lại form thành viên,
      // nên âm thầm bỏ qua dữ liệu họ vừa nhập sẽ gây nhầm lẫn hơn là cập
      // nhật. Cũng nhờ vậy nhóm sửa được email/MSSV gõ sai ở lần nộp trước.
      existingTeam.members = teamMembers;
      // Giữ nguyên `teamNameNormalized` (đang bằng nhau) nhưng nhận cách
      // viết hoa/khoảng trắng mới nhất mà nhóm vừa nhập.
      existingTeam.teamName = teamName;
      existingTeam.status = 'SUBMITTED';
      getDb().submissionFiles.push(...files);
      saveDb();

      // 200 (không phải 201): không có resource nào được tạo mới.
      return HttpResponse.json({ team: existingTeam, files, resubmitted: true }, { status: 200 });
    }

    const team: Team = {
      teamId,
      assignmentId,
      teamName,
      teamNameNormalized,
      members: teamMembers,
      status: 'SUBMITTED',
      createdAt: now,
    };

    getDb().teams.push(team);
    getDb().submissionFiles.push(...files);
    saveDb();

    return HttpResponse.json({ team, files, resubmitted: false }, { status: 201 });
  }),
];
