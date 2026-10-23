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
import type {
  SubmissionFile,
  SubmissionHistoryItem,
  Team,
  TeamMember,
} from '@quick-grading/shared-types';
import {
  AssignmentClosedError,
  DomainError,
  NotFoundError,
  TeamNameConflictError,
  ValidationError,
} from '@quick-grading/shared-types';
import { getDb, saveDb } from '../db.js';

/** Chuyển 1 typed `DomainError` thành response `{ code, message }` đúng httpStatus của nó */
export function errorResponse(error: DomainError) {
  return HttpResponse.json(
    { code: error.code, message: error.message },
    { status: error.httpStatus },
  );
}

/** Chuẩn hoá tên nhóm để so khớp (lowercase + trim) — giống logic ở `db.ts`/`teams.ts` */
export function normalizeTeamName(teamName: string): string {
  return teamName.trim().toLowerCase();
}

/** Kích thước tối đa 1 file được nhận — Requirement 2.8, 11.3 */
export const MAX_MD_FILE_SIZE_BYTES = 2 * 1024 * 1024;
export const MAX_XML_FILE_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Regex email "đủ tốt" cho mock — không cần RFC-đầy đủ, chỉ chặn input rõ sai định dạng */
const EMAIL_REGEX = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** Shape 1 phần tử trong field `members` (JSON) sau khi parse, trước khi validate kỹ */
interface RawMember {
  memberName?: unknown;
  email?: unknown;
  studentCode?: unknown;
}

/** Validate mảng members (dùng chung cho JSON body và parsed form data) */
export function validateMembersArray(
  parsed: unknown,
): { members: Omit<TeamMember, 'memberId'>[] } | { error: ValidationError } {
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

/** Parse + validate field `members` (JSON-stringified array). Trả về lỗi validate đầu tiên gặp phải, nếu có. */
export function parseMembers(
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

  return validateMembersArray(parsed);
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
  const maxSize = expectedExtension === '.md' ? MAX_MD_FILE_SIZE_BYTES : MAX_XML_FILE_SIZE_BYTES;
  const maxMbStr = expectedExtension === '.md' ? '2MB' : '5MB';
  if (file.size > maxSize) {
    // Requirement 2.8, 11.3
    return {
      error: new ValidationError(
        `File ${fieldName} vượt quá kích thước tối đa ${maxMbStr}.`,
        fieldName,
      ),
    };
  }

  return { file };
}

/**
 * Sinh "storage key" giả cho 1 file đã nộp.
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

/**
 * Thực hiện commit bài nộp vào database mock một cách đồng bộ (atomic).
 * Dùng chung cho cả POST /api/teams/submit và POST /api/submissions/:sid/finalize.
 */
export function commitSubmission(params: {
  assignmentId: string;
  teamName: string;
  members: Omit<TeamMember, 'memberId'>[];
  mdFile: File;
  xmlFile: File;
}):
  | { status: 201 | 200; body: { team: Team; files: SubmissionFile[]; resubmitted: boolean } }
  | { error: DomainError } {
  const { assignmentId, teamName, members, mdFile, xmlFile } = params;

  const assignment = getDb().assignments.find((a) => a.assignmentId === assignmentId);
  if (!assignment) {
    return { error: new NotFoundError('Assignment', assignmentId) };
  }
  if (assignment.status !== 'OPEN') {
    return { error: new AssignmentClosedError(assignmentId) };
  }

  const teamNameNormalized = normalizeTeamName(teamName);
  const existingTeam = getDb().teams.find(
    (team) => team.assignmentId === assignmentId && team.teamNameNormalized === teamNameNormalized,
  );

  if (existingTeam?.status === 'SUBMITTED') {
    return { error: new TeamNameConflictError(teamName, assignmentId) };
  }

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

  const assignmentName = assignment.assignmentName;
  const historyItem: SubmissionHistoryItem = {
    submissionId: (files[0]?.s3Key || now).replace(/^.*\//, '') || now,
    assignmentId,
    assignmentName,
    teamId,
    teamName,
    submittedAt: now,
    status: 'SUBMITTED',
    resubmitted: Boolean(existingTeam),
    members: teamMembers,
    files: [
      { fileName: mdFile.name, fileType: 'md', size: mdFile.size },
      { fileName: xmlFile.name, fileType: 'xml', size: xmlFile.size },
    ],
  };
  if (!getDb().submissionHistory) {
    getDb().submissionHistory = [];
  }
  getDb().submissionHistory.unshift(historyItem);

  if (existingTeam) {
    for (const file of getDb().submissionFiles) {
      if (file.teamId === teamId) {
        file.isLatest = false;
      }
    }

    existingTeam.members = teamMembers;
    existingTeam.teamName = teamName;
    existingTeam.status = 'SUBMITTED';
    getDb().submissionFiles.push(...files);
    saveDb();

    return { status: 200, body: { team: existingTeam, files, resubmitted: true } };
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

  return { status: 201, body: { team, files, resubmitted: false } };
}

export const submissionHandlers = [
  // POST /api/teams/submit — Requirement 1.7, 1.8, 2.1-2.13, 3.2, 11.3
  http.post('/api/teams/submit', async ({ request }) => {
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
      return errorResponse(new ValidationError('Tên nhóm không được để trống.', 'teamName'));
    }
    const teamName = teamNameRaw.trim();

    // Validate danh sách thành viên
    const membersResult = parseMembers(formData.get('members') as string | null);
    if ('error' in membersResult) {
      return errorResponse(membersResult.error);
    }
    const { members } = membersResult;

    // Validate đúng 2 file
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

    // Commit đồng bộ
    const commitResult = commitSubmission({
      assignmentId,
      teamName,
      members,
      mdFile,
      xmlFile,
    });

    if ('error' in commitResult) {
      return errorResponse(commitResult.error);
    }

    return HttpResponse.json(commitResult.body, { status: commitResult.status });
  }),

  // GET /api/submissions/history
  http.get('/api/submissions/history', ({ request }) => {
    const url = new URL(request.url);
    const email = url.searchParams.get('email')?.trim().toLowerCase() ?? '';
    if (!email) {
      return errorResponse(new ValidationError('Email không hợp lệ.', 'email'));
    }
    const all = getDb().submissionHistory ?? [];
    const matched = all.filter((item) =>
      item.members.some((m) => m.email.trim().toLowerCase() === email),
    );
    return HttpResponse.json(matched);
  }),
];
