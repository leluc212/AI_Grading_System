/**
 * Validate input server-side (infra-plan mục 5, 8). Không tin bất kỳ dữ liệu
 * nào từ client: kiểm tra kiểu, độ dài, định dạng; từ chối field lạ; dựng
 * object mới chỉ từ các field đã kiểm tra (không spread input).
 */
import type {
  CreateSubmissionRequest,
  FileType,
  UploadFileMeta,
} from '@quick-grading/shared-types';
import {
  EMAIL_MAX_LENGTH,
  EMAIL_PATTERN,
  FILE_NAME_MAX_LENGTH,
  MAX_FILE_SIZE_BYTES,
  MEMBER_NAME_MAX_LENGTH,
  MEMBERS_MAX,
  MEMBERS_MIN,
  MIN_FILE_SIZE_BYTES,
  STUDENT_CODE_MAX_LENGTH,
  TEAM_NAME_MAX_LENGTH,
  ValidationError,
} from '@quick-grading/shared-types';
import { cleanTeamName } from './teamName.js';

/** assignmentId / teamId: UUID của seed hoặc ULID. */
const RESOURCE_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
/** submissionId: ULID (Crockford base32, 26 ký tự). */
const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

const EXTENSIONS: Record<FileType, string> = { md: '.md', xml: '.xml' };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Từ chối mọi field không nằm trong danh sách cho phép. */
function assertOnlyKeys(obj: Record<string, unknown>, allowed: readonly string[], field: string) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new ValidationError('Dữ liệu gửi lên chứa trường không hợp lệ.', field);
    }
  }
}

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export function parseAssignmentId(value: unknown): string {
  if (typeof value !== 'string' || !RESOURCE_ID_PATTERN.test(value)) {
    throw new ValidationError('Mã đợt chấm không hợp lệ.', 'assignmentId');
  }
  return value;
}

export function parseSubmissionId(value: unknown): string {
  if (typeof value !== 'string' || !ULID_PATTERN.test(value)) {
    throw new ValidationError('Mã phiên nộp bài không hợp lệ.', 'submissionId');
  }
  return value;
}

export function parseTeamName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ValidationError('Tên nhóm không được để trống.', 'teamName');
  }
  const name = cleanTeamName(value);
  if (name.length === 0) {
    throw new ValidationError('Tên nhóm không được để trống.', 'teamName');
  }
  if (name.length > TEAM_NAME_MAX_LENGTH || hasControlChars(name)) {
    throw new ValidationError(
      `Tên nhóm không hợp lệ (tối đa ${TEAM_NAME_MAX_LENGTH} ký tự).`,
      'teamName',
    );
  }
  return name;
}

function parseMember(value: unknown, index: number): CreateSubmissionRequest['members'][number] {
  const position = index + 1;
  if (!isPlainObject(value)) {
    throw new ValidationError(`Thành viên thứ ${position}: dữ liệu không hợp lệ.`, 'members');
  }
  assertOnlyKeys(value, ['memberName', 'email', 'studentCode'], 'members');

  const { memberName, email, studentCode } = value;
  if (typeof memberName !== 'string') {
    throw new ValidationError(
      `Thành viên thứ ${position}: tên sinh viên không được để trống.`,
      'members',
    );
  }
  const name = memberName.normalize('NFC').trim();
  if (name.length === 0) {
    throw new ValidationError(
      `Thành viên thứ ${position}: tên sinh viên không được để trống.`,
      'members',
    );
  }
  if (name.length > MEMBER_NAME_MAX_LENGTH || hasControlChars(name)) {
    throw new ValidationError(
      `Thành viên thứ ${position}: tên sinh viên tối đa ${MEMBER_NAME_MAX_LENGTH} ký tự.`,
      'members',
    );
  }

  if (typeof email !== 'string') {
    throw new ValidationError(`Thành viên thứ ${position}: email không đúng định dạng.`, 'members');
  }
  const mail = email.trim();
  if (mail.length > EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(mail)) {
    throw new ValidationError(`Thành viên thứ ${position}: email không đúng định dạng.`, 'members');
  }

  let code: string | undefined;
  if (studentCode !== undefined) {
    if (typeof studentCode !== 'string') {
      throw new ValidationError(`Thành viên thứ ${position}: MSSV không hợp lệ.`, 'members');
    }
    const trimmed = studentCode.trim();
    if (trimmed.length > STUDENT_CODE_MAX_LENGTH || hasControlChars(trimmed)) {
      throw new ValidationError(
        `Thành viên thứ ${position}: MSSV tối đa ${STUDENT_CODE_MAX_LENGTH} ký tự.`,
        'members',
      );
    }
    code = trimmed.length > 0 ? trimmed : undefined;
  }

  return code === undefined
    ? { memberName: name, email: mail }
    : { memberName: name, email: mail, studentCode: code };
}

function parseFileMeta(value: unknown, fileType: FileType): UploadFileMeta {
  const field = fileType === 'md' ? 'mdFile' : 'xmlFile';
  const ext = EXTENSIONS[fileType];
  if (!isPlainObject(value)) {
    throw new ValidationError(`Thiếu file ${ext}.`, field);
  }
  assertOnlyKeys(value, ['fileName', 'size'], field);

  const { fileName, size } = value;
  if (
    typeof fileName !== 'string' ||
    fileName.length === 0 ||
    fileName.length > FILE_NAME_MAX_LENGTH ||
    fileName.includes('/') ||
    fileName.includes('\\') ||
    hasControlChars(fileName)
  ) {
    throw new ValidationError(`Tên file ${ext} không hợp lệ.`, field);
  }
  if (!fileName.toLowerCase().endsWith(ext)) {
    throw new ValidationError(`File phải có phần mở rộng ${ext}.`, field);
  }
  if (
    typeof size !== 'number' ||
    !Number.isInteger(size) ||
    size < MIN_FILE_SIZE_BYTES ||
    size > MAX_FILE_SIZE_BYTES
  ) {
    throw new ValidationError(`File ${ext} phải lớn hơn 0 và không vượt quá 5MB.`, field);
  }
  return { fileName: fileName.normalize('NFC'), size };
}

export function parseCreateSubmissionRequest(body: unknown): CreateSubmissionRequest {
  if (!isPlainObject(body)) {
    throw new ValidationError('Dữ liệu gửi lên không hợp lệ.');
  }
  assertOnlyKeys(body, ['assignmentId', 'teamName', 'members', 'files'], 'body');

  const assignmentId = parseAssignmentId(body.assignmentId);
  const teamName = parseTeamName(body.teamName);

  const { members } = body;
  if (!Array.isArray(members) || members.length < MEMBERS_MIN) {
    throw new ValidationError('Nhóm phải có ít nhất 1 thành viên.', 'members');
  }
  if (members.length > MEMBERS_MAX) {
    throw new ValidationError(`Nhóm có tối đa ${MEMBERS_MAX} thành viên.`, 'members');
  }

  const { files } = body;
  if (!isPlainObject(files)) {
    throw new ValidationError('Thiếu file nộp bài.', 'files');
  }
  assertOnlyKeys(files, ['md', 'xml'], 'files');

  return {
    assignmentId,
    teamName,
    members: members.map((m, i) => parseMember(m, i)),
    files: { md: parseFileMeta(files.md, 'md'), xml: parseFileMeta(files.xml, 'xml') },
  };
}

export function parseCheckNameQuery(query: Record<string, string | undefined> | undefined): {
  assignmentId: string;
  teamName: string;
} {
  return {
    assignmentId: parseAssignmentId(query?.assignmentId),
    teamName: parseTeamName(query?.teamName),
  };
}
