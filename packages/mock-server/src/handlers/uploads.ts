/**
 * MSW request handlers cho luồng nộp bài 2 bước:
 *   1. POST /api/submissions (JSON): Tạo upload session
 *   2. POST /mock-s3/upload (multipart): Giả lập presigned upload lên S3
 *   3. POST /api/submissions/:submissionId/finalize (JSON): Hoàn tất nộp bài
 *
 * Session upload và các file tạm được lưu trong memory Map ở module level
 * (không lưu vào localStorage vì File object không serialize được).
 */
import { http, HttpResponse } from 'msw';
import type {
  CreateSubmissionRequest,
  CreateSubmissionResponse,
  TeamMember,
} from '@quick-grading/shared-types';
import {
  AssignmentClosedError,
  NotFoundError,
  TeamNameConflictError,
  ValidationError,
} from '@quick-grading/shared-types';
import { getDb, registerResetHook } from '../db.js';
import {
  commitSubmission,
  errorResponse,
  MAX_FILE_SIZE_BYTES,
  normalizeTeamName,
  validateFile,
  validateMembersArray,
} from './submissions.js';

interface UploadSession {
  submissionId: string;
  assignmentId: string;
  teamName: string;
  members: Omit<TeamMember, 'memberId'>[];
  mdKey: string;
  xmlKey: string;
  files: Map<string, File>;
}

const uploadSessions = new Map<string, UploadSession>();
const keyToSessionMap = new Map<string, UploadSession>();

export function resetUploadSessions(): void {
  uploadSessions.clear();
  keyToSessionMap.clear();
}

// Đăng ký hook để tự động dọn session khi resetMockDb() chạy trong các test
registerResetHook(resetUploadSessions);

export const uploadHandlers = [
  // 1. POST /api/submissions (JSON)
  http.post('/api/submissions', async ({ request }) => {
    const body = (await request
      .json()
      .catch(() => null)) as Partial<CreateSubmissionRequest> | null;
    if (!body || typeof body !== 'object') {
      return errorResponse(new ValidationError('Request body không hợp lệ hoặc không phải JSON.'));
    }

    const { assignmentId, teamName, members, files } = body;

    if (typeof assignmentId !== 'string' || assignmentId.trim().length === 0) {
      return errorResponse(new ValidationError('Thiếu assignmentId.', 'assignmentId'));
    }

    if (typeof teamName !== 'string' || teamName.trim().length === 0) {
      return errorResponse(new ValidationError('Tên nhóm không được để trống.', 'teamName'));
    }

    const assignment = getDb().assignments.find((a) => a.assignmentId === assignmentId);
    if (!assignment) {
      return errorResponse(new NotFoundError('Assignment', assignmentId));
    }
    if (assignment.status !== 'OPEN') {
      return errorResponse(new AssignmentClosedError(assignmentId));
    }

    const membersResult = validateMembersArray(members);
    if ('error' in membersResult) {
      return errorResponse(membersResult.error);
    }

    if (!files || typeof files !== 'object' || !files.md || !files.xml) {
      return errorResponse(new ValidationError('Thiếu thông tin file nộp bài.', 'files'));
    }

    const mdMeta = files.md;
    const xmlMeta = files.xml;

    if (
      typeof mdMeta.fileName !== 'string' ||
      !mdMeta.fileName.toLowerCase().endsWith('.md') ||
      typeof mdMeta.size !== 'number' ||
      mdMeta.size <= 0 ||
      mdMeta.size > MAX_FILE_SIZE_BYTES
    ) {
      return errorResponse(new ValidationError('File md không hợp lệ.', 'files.md'));
    }

    if (
      typeof xmlMeta.fileName !== 'string' ||
      !xmlMeta.fileName.toLowerCase().endsWith('.xml') ||
      typeof xmlMeta.size !== 'number' ||
      xmlMeta.size <= 0 ||
      xmlMeta.size > MAX_FILE_SIZE_BYTES
    ) {
      return errorResponse(new ValidationError('File xml không hợp lệ.', 'files.xml'));
    }

    const teamNameNormalized = normalizeTeamName(teamName);
    const existingTeam = getDb().teams.find(
      (team) =>
        team.assignmentId === assignmentId && team.teamNameNormalized === teamNameNormalized,
    );

    if (existingTeam?.status === 'SUBMITTED') {
      return errorResponse(new TeamNameConflictError(teamName, assignmentId));
    }

    const submissionId = crypto.randomUUID();
    const mdKey = `submissions/${assignmentId}/${submissionId}/report.md`;
    const xmlKey = `submissions/${assignmentId}/${submissionId}/data.xml`;

    const session: UploadSession = {
      submissionId,
      assignmentId,
      teamName: teamName.trim(),
      members: membersResult.members,
      mdKey,
      xmlKey,
      files: new Map(),
    };

    uploadSessions.set(submissionId, session);
    keyToSessionMap.set(mdKey, session);
    keyToSessionMap.set(xmlKey, session);

    const mockS3UploadUrl = new URL('/mock-s3/upload', request.url).href;
    const expiresAt = new Date(Date.now() + 600 * 1000).toISOString();

    const responseBody: CreateSubmissionResponse = {
      submissionId,
      uploads: {
        md: {
          url: mockS3UploadUrl,
          fields: {
            key: mdKey,
            'Content-Type': 'text/markdown; charset=utf-8',
          },
        },
        xml: {
          url: mockS3UploadUrl,
          fields: {
            key: xmlKey,
            'Content-Type': 'application/xml',
          },
        },
      },
      expiresAt,
    };

    return HttpResponse.json(responseBody, { status: 201 });
  }),

  // 2. POST /mock-s3/upload (multipart)
  http.post('/mock-s3/upload', async ({ request }) => {
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return new HttpResponse(
        '<Error><Code>InvalidArgument</Code><Message>Form data required</Message></Error>',
        { status: 400, headers: { 'Content-Type': 'application/xml' } },
      );
    }

    const key = formData.get('key');
    if (typeof key !== 'string' || !keyToSessionMap.has(key)) {
      return new HttpResponse(
        '<Error><Code>InvalidArgument</Code><Message>Invalid or unknown key</Message></Error>',
        { status: 400, headers: { 'Content-Type': 'application/xml' } },
      );
    }

    const file = formData.get('file');
    if (!(file instanceof File) || file.size > MAX_FILE_SIZE_BYTES) {
      return new HttpResponse(
        '<Error><Code>EntityTooLarge</Code><Message>File is missing or too large</Message></Error>',
        { status: 400, headers: { 'Content-Type': 'application/xml' } },
      );
    }

    const session = keyToSessionMap.get(key)!;
    session.files.set(key, file);

    return new HttpResponse(null, { status: 204 });
  }),

  // 3. POST /api/submissions/:submissionId/finalize
  http.post('/api/submissions/:submissionId/finalize', ({ params }) => {
    const submissionId = params.submissionId as string;
    const session = uploadSessions.get(submissionId);
    if (!session) {
      return errorResponse(new NotFoundError('UploadSession', submissionId));
    }

    const mdFile = session.files.get(session.mdKey);
    const xmlFile = session.files.get(session.xmlKey);

    if (!mdFile || !xmlFile) {
      return errorResponse(new ValidationError('Chưa tải đủ các file yêu cầu.'));
    }

    const mdResult = validateFile(mdFile, [mdFile], 'mdFile', '.md');
    if ('error' in mdResult) {
      return errorResponse(mdResult.error);
    }

    const xmlResult = validateFile(xmlFile, [xmlFile], 'xmlFile', '.xml');
    if ('error' in xmlResult) {
      return errorResponse(xmlResult.error);
    }

    // Cam kết tính nguyên tử: gọi commit đồng bộ, không có await sau khi đọc session
    const commitResult = commitSubmission({
      assignmentId: session.assignmentId,
      teamName: session.teamName,
      members: session.members,
      mdFile: mdResult.file,
      xmlFile: xmlResult.file,
    });

    uploadSessions.delete(submissionId);
    keyToSessionMap.delete(session.mdKey);
    keyToSessionMap.delete(session.xmlKey);

    if ('error' in commitResult) {
      return errorResponse(commitResult.error);
    }

    return HttpResponse.json(commitResult.body, { status: commitResult.status });
  }),
];
