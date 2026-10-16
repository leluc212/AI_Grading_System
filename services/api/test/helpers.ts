/**
 * Tiện ích dùng chung cho test: env giả, item DynamoDB mẫu, object S3 giả.
 */
import type { CreateSubmissionRequest } from '@quick-grading/shared-types';

export const ASSIGNMENT_ID = 'a1111111-1111-4111-8111-111111111111';
export const TEAM_ID = '01JA0000000000000000000001';
export const SUBMISSION_ID = '01JA0000000000000000000002';

export function setTestEnv(): void {
  process.env.TABLE_NAME = 'QuickGrading-test';
  process.env.BUCKET_NAME = 'quick-grading-test-000000000000';
  process.env.STAGE = 'test';
  process.env.AWS_REGION = 'ap-southeast-1';
  process.env.AWS_ACCESS_KEY_ID = 'AKIDTEST';
  process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';
}

export function assignmentItem(status: 'OPEN' | 'CLOSED' = 'OPEN') {
  return {
    PK: `ASSIGNMENT#${ASSIGNMENT_ID}`,
    SK: 'META',
    GSI1PK: 'ASSIGNMENTS',
    GSI1SK: '2024-09-01T08:00:00.000Z',
    assignmentId: ASSIGNMENT_ID,
    assignmentName: 'Đợt 1 - Lập trình Web - K21',
    status,
    createdAt: '2024-09-01T08:00:00.000Z',
    createdBy: 'admin',
    submittedTeamCount: 3,
  };
}

export function teamItem(status: 'OPEN' | 'SUBMITTED' | 'RESUBMISSION_ALLOWED') {
  return {
    PK: `TEAM#${TEAM_ID}`,
    SK: 'META',
    GSI1PK: `ASSIGNMENT#${ASSIGNMENT_ID}#TEAMS`,
    GSI1SK: `2024-09-02T00:00:00.000Z#${TEAM_ID}`,
    teamId: TEAM_ID,
    assignmentId: ASSIGNMENT_ID,
    teamName: 'Nhóm A',
    teamNameNormalized: 'nhóm a',
    members: [{ memberId: 'm-old', memberName: 'Cũ', email: 'cu@example.com' }],
    status,
    createdAt: '2024-09-02T00:00:00.000Z',
    latestSubmissionId: 'OLD',
    activeGradingAttemptId: 'should-not-leak',
  };
}

export function lockItem(teamId = TEAM_ID) {
  return {
    PK: `ASSIGNMENT#${ASSIGNMENT_ID}`,
    SK: 'TEAMNAME#nhóm a',
    teamId,
    createdAt: '2024-09-02T00:00:00.000Z',
  };
}

export function validRequest(): CreateSubmissionRequest {
  return {
    assignmentId: ASSIGNMENT_ID,
    teamName: 'Nhóm A',
    members: [{ memberName: 'Nguyễn Văn A', email: 'a@example.com', studentCode: 'SV001' }],
    files: {
      md: { fileName: 'bai-lam.md', size: 100 },
      xml: { fileName: 'bai-lam.xml', size: 200 },
    },
  };
}

export function sessionItem(
  overrides: Partial<{ existingTeam: boolean; state: string; ttl: number; teamId: string }> = {},
  nowMs = Date.now(),
) {
  const teamId = overrides.teamId ?? TEAM_ID;
  const prefix = `submissions/${ASSIGNMENT_ID}/${teamId}/${SUBMISSION_ID}`;
  return {
    PK: `UPLOAD#${SUBMISSION_ID}`,
    SK: 'META',
    submissionId: SUBMISSION_ID,
    assignmentId: ASSIGNMENT_ID,
    teamId,
    existingTeam: overrides.existingTeam ?? false,
    teamName: 'Nhóm A',
    teamNameNormalized: 'nhóm a',
    members: [{ memberName: 'Nguyễn Văn A', email: 'a@example.com', studentCode: 'SV001' }],
    files: {
      md: { fileName: 'bai-lam.md', size: 100, s3Key: `${prefix}/report.md` },
      xml: { fileName: 'bai-lam.xml', size: 200, s3Key: `${prefix}/data.xml` },
    },
    state: overrides.state ?? 'PENDING',
    createdAt: new Date(nowMs).toISOString(),
    ttl: overrides.ttl ?? Math.floor(nowMs / 1000) + 3600,
  };
}

/** Body giả cho GetObject (chỉ cần `transformToByteArray`). */
export function body(content: string | Uint8Array) {
  const bytes =
    typeof content === 'string' ? new Uint8Array(Buffer.from(content, 'utf8')) : content;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { transformToByteArray: async () => bytes } as any;
}
