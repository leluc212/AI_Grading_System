/**
 * Luồng nộp bài 2 bước (infra-plan mục 2.1, 5).
 *
 * 1. `createSubmission`: validate, kiểm tra đợt/nhóm, lưu phiên upload, cấp 2
 *    presigned POST. CHƯA ghi Team nào -> request bỏ dở không chiếm tên nhóm.
 * 2. Browser upload thẳng 2 file lên S3.
 * 3. `finalizeSubmission`: kiểm tra object -> gắn tag `state=final` -> MỚI
 *    TransactWrite. Thứ tự này có chủ ý: nếu transaction lỗi chỉ còn file mồ
 *    côi nhỏ; làm ngược lại thì lifecycle có thể xoá mất bài đã ghi nhận.
 *
 * Phase 1 không đẩy gì vào SQS (`autoGradeOnSubmit=false`).
 */
import { randomUUID } from 'node:crypto';
import { ulid } from 'ulid';
import type {
  CreateSubmissionRequest,
  CreateSubmissionResponse,
  FileType,
  SubmissionFile,
  Team,
  TeamMember,
} from '@quick-grading/shared-types';
import {
  MAX_FILE_SIZE_BYTES,
  MIN_FILE_SIZE_BYTES,
  NotFoundError,
  PRESIGNED_POST_EXPIRES_SECONDS,
  TeamNameConflictError,
  ValidationError,
} from '@quick-grading/shared-types';
import { assertFileHead } from '../domain/fileContent.js';
import { SUBMISSION_CONTENT_TYPES, submissionObjectKey } from '../domain/keys.js';
import { decideCreate } from '../domain/submissionDecision.js';
import { normalizeTeamName } from '../domain/teamName.js';
import { getAssignment } from '../repositories/assignmentsRepo.js';
import {
  finalizeExistingTeam,
  finalizeNewTeam,
  findTeamByName,
  type StoredFileMeta,
  type SubmissionRecord,
} from '../repositories/teamsRepo.js';
import { getPendingUploadSession, putUploadSession } from '../repositories/uploadsRepo.js';
import {
  createSubmissionUploadPost,
  headSubmissionObject,
  markObjectFinal,
  readObjectHead,
} from '../storage/s3.js';
import { getActiveGradingConfig } from '../repositories/configRepo.js';
import { triggerGrading } from './gradingService.js';
import { log } from '../lib/logger.js';

const FILE_TYPES: readonly FileType[] = ['md', 'xml'];
const FIELD_BY_TYPE: Record<FileType, string> = { md: 'mdFile', xml: 'xmlFile' };

export async function createSubmission(
  req: CreateSubmissionRequest,
  nowMs = Date.now(),
): Promise<CreateSubmissionResponse> {
  const teamNameNormalized = normalizeTeamName(req.teamName);
  const assignment = await getAssignment(req.assignmentId);
  const existing = assignment
    ? await findTeamByName(req.assignmentId, teamNameNormalized)
    : undefined;
  const decision = decideCreate(req.assignmentId, req.teamName, assignment, existing);

  const teamId = decision.kind === 'EXISTING' ? decision.team.teamId : ulid(nowMs);
  const submissionId = ulid(nowMs);
  const keys = {
    md: submissionObjectKey(req.assignmentId, teamId, submissionId, 'md'),
    xml: submissionObjectKey(req.assignmentId, teamId, submissionId, 'xml'),
  };

  await putUploadSession(
    {
      submissionId,
      assignmentId: req.assignmentId,
      teamId,
      existingTeam: decision.kind === 'EXISTING',
      teamName: req.teamName,
      teamNameNormalized,
      members: req.members,
      files: {
        md: { fileName: req.files.md.fileName, size: req.files.md.size, s3Key: keys.md },
        xml: { fileName: req.files.xml.fileName, size: req.files.xml.size, s3Key: keys.xml },
      },
      createdAt: new Date(nowMs).toISOString(),
    },
    nowMs,
  );

  const [md, xml] = await Promise.all([
    createSubmissionUploadPost({ key: keys.md, fileType: 'md' }),
    createSubmissionUploadPost({ key: keys.xml, fileType: 'xml' }),
  ]);

  return {
    submissionId,
    uploads: { md, xml },
    expiresAt: new Date(nowMs + PRESIGNED_POST_EXPIRES_SECONDS * 1000).toISOString(),
  };
}

/** Kiểm tra object đã upload: tồn tại, kích thước, Content-Type, phần đầu file. */
async function verifyUploadedObject(
  fileType: FileType,
  key: string,
): Promise<{ etag: string; size: number }> {
  const ext = fileType === 'md' ? '.md' : '.xml';
  const field = FIELD_BY_TYPE[fileType];
  const head = await headSubmissionObject(key);
  if (head === undefined) {
    throw new ValidationError(`Thiếu file ${ext}, vui lòng tải lên lại.`, field);
  }
  if (head.size < MIN_FILE_SIZE_BYTES || head.size > MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(`File ${ext} phải lớn hơn 0 và không vượt quá 5MB.`, field);
  }
  if (head.contentType !== SUBMISSION_CONTENT_TYPES[fileType]) {
    throw new ValidationError(`File ${ext} không đúng định dạng.`, field);
  }
  const bytes = await readObjectHead(key, 1024);
  assertFileHead(fileType, bytes);
  return { etag: head.etag, size: head.size };
}

export interface FinalizeResult {
  status: 200 | 201;
  team: Team;
  files: SubmissionFile[];
  resubmitted: boolean;
}

export async function finalizeSubmission(
  submissionId: string,
  nowMs = Date.now(),
): Promise<FinalizeResult> {
  const session = await getPendingUploadSession(submissionId, nowMs);
  if (session === undefined) {
    throw new NotFoundError(
      'UploadSession',
      submissionId,
      'Phiên nộp bài đã hết hạn hoặc đã được hoàn tất, vui lòng nộp lại.',
    );
  }

  // 1) Kiểm tra cả 2 object trước khi đụng vào bất cứ thứ gì.
  const verifiedEntries = await Promise.all(
    FILE_TYPES.map(async (fileType) => {
      const obj = await verifyUploadedObject(fileType, session.files[fileType].s3Key);
      return [fileType, obj] as const;
    }),
  );
  const verified: Partial<Record<FileType, { etag: string; size: number }>> =
    Object.fromEntries(verifiedEntries);

  // 2) Re-resolve nhóm tại thời điểm finalize (có thể đã đổi từ lúc tạo phiên).
  const existing = await findTeamByName(session.assignmentId, session.teamNameNormalized);
  if (existing !== undefined && existing.status === 'SUBMITTED') {
    throw new TeamNameConflictError(session.teamName, session.assignmentId);
  }
  if (existing !== undefined && existing.teamId !== session.teamId) {
    // Nhóm khác cùng tên được tạo sau khi phiên này mở: key S3 đã gắn teamId cũ.
    throw new TeamNameConflictError(session.teamName, session.assignmentId);
  }

  // 3) Gắn tag `final` cho cả 2 file TRƯỚC khi ghi DB.
  await Promise.all(FILE_TYPES.map((fileType) => markObjectFinal(session.files[fileType].s3Key)));

  // 4) Transaction.
  const submittedAt = new Date(nowMs).toISOString();
  const storedFiles = {} as Record<FileType, StoredFileMeta>;
  for (const fileType of FILE_TYPES) {
    const v = verified[fileType] as { etag: string; size: number };
    storedFiles[fileType] = {
      fileName: session.files[fileType].fileName,
      s3Key: session.files[fileType].s3Key,
      etag: v.etag,
      size: v.size,
    };
  }
  const submission: SubmissionRecord = { submissionId, submittedAt, files: storedFiles };
  const members: TeamMember[] = session.members.map((m) => ({ ...m, memberId: randomUUID() }));

  let team: Team;
  let status: 200 | 201;
  if (existing === undefined) {
    team = {
      teamId: session.teamId,
      assignmentId: session.assignmentId,
      teamName: session.teamName,
      teamNameNormalized: session.teamNameNormalized,
      members,
      status: 'SUBMITTED',
      createdAt: submittedAt,
    };
    await finalizeNewTeam(team, submission);
    status = 201;
  } else {
    const observed = existing.status as 'OPEN' | 'RESUBMISSION_ALLOWED';
    team = { ...existing, members, teamName: session.teamName, status: 'SUBMITTED' };
    await finalizeExistingTeam(team, observed, submission);
    status = 200;
  }

  const files: SubmissionFile[] = FILE_TYPES.map((fileType) => ({
    teamId: team.teamId,
    fileType,
    fileName: storedFiles[fileType].fileName,
    s3Key: storedFiles[fileType].s3Key,
    etag: storedFiles[fileType].etag,
    submittedAt,
    isLatest: true,
  }));

  // 5) Tự động chấm nếu autoGradeOnSubmit được bật trong cấu hình
  try {
    const gradingConfig = await getActiveGradingConfig();
    if (gradingConfig?.autoGradeOnSubmit) {
      await triggerGrading({ teamId: team.teamId, triggeredBy: 'SYSTEM' });
    }
  } catch (autoGradeErr) {
    log('error', `Lỗi khi kích hoạt autoGradeOnSubmit cho nhóm ${team.teamId}`, {
      teamId: team.teamId,
      errorName: autoGradeErr instanceof Error ? autoGradeErr.name : 'AutoGradeError',
    });
  }

  return { status, team, files, resubmitted: status === 200 };
}

export async function checkTeamName(
  assignmentId: string,
  teamName: string,
): Promise<{ available: boolean }> {
  const team = await findTeamByName(assignmentId, normalizeTeamName(teamName));
  return { available: !(team !== undefined && team.status === 'SUBMITTED') };
}
