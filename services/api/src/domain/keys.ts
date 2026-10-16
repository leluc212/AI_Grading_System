/**
 * Builder khoá DynamoDB / S3 cho Lambda `public-api`.
 *
 * Property 6: public-api không được đọc kết quả chấm. IAM không lọc được theo
 * SK, nên ngoài việc không cấp Scan/Query bảng gốc/BatchGet, module này CHỈ
 * dựng được khoá ASSIGNMENT / TEAMNAME / TEAM META / SUBMISSION / UPLOAD —
 * không có builder nào cho `GRADING#`.
 */
import type { FileType } from '@quick-grading/shared-types';

export interface ItemKey {
  PK: string;
  SK: string;
}

export function assignmentKey(assignmentId: string): ItemKey {
  return { PK: `ASSIGNMENT#${assignmentId}`, SK: 'META' };
}

export function teamNameLockKey(assignmentId: string, normalizedTeamName: string): ItemKey {
  return { PK: `ASSIGNMENT#${assignmentId}`, SK: `TEAMNAME#${normalizedTeamName}` };
}

export function teamKey(teamId: string): ItemKey {
  return { PK: `TEAM#${teamId}`, SK: 'META' };
}

export function submissionKey(teamId: string, submissionId: string): ItemKey {
  return { PK: `TEAM#${teamId}`, SK: `SUBMISSION#${submissionId}` };
}

export function uploadKey(submissionId: string): ItemKey {
  return { PK: `UPLOAD#${submissionId}`, SK: 'META' };
}

export const ASSIGNMENTS_GSI1PK = 'ASSIGNMENTS';

export function teamsGsi1Pk(assignmentId: string): string {
  return `ASSIGNMENT#${assignmentId}#TEAMS`;
}

const OBJECT_NAMES: Record<FileType, string> = { md: 'report.md', xml: 'data.xml' };

/** `submissions/{assignmentId}/{teamId}/{submissionId}/report.md|data.xml` */
export function submissionObjectKey(
  assignmentId: string,
  teamId: string,
  submissionId: string,
  fileType: FileType,
): string {
  return `submissions/${assignmentId}/${teamId}/${submissionId}/${OBJECT_NAMES[fileType]}`;
}

/** Content-Type cố định, khoá cứng trong presigned POST. */
export const SUBMISSION_CONTENT_TYPES: Record<FileType, string> = {
  md: 'text/markdown; charset=utf-8',
  xml: 'application/xml',
};
