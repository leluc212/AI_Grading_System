/**
 * Team + khoá tên nhóm + transaction finalize (infra-plan mục 4.1, 5).
 *
 * Property 1 (không có 2 nhóm cùng tên trong 1 đợt) được giữ bằng item khoá
 * `ASSIGNMENT#{aid}` / `TEAMNAME#{normalized}` ghi với điều kiện
 * `attribute_not_exists(PK)` trong CÙNG transaction với Team + Submission, nên
 * 2 finalize đồng thời cùng tên chỉ 1 cái thắng.
 */
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type {
  FileType,
  SubmissionHistoryFile,
  SubmissionHistoryItem,
  Team,
  TeamMember,
  TeamStatus,
} from '@quick-grading/shared-types';
import {
  AssignmentClosedError,
  NotFoundError,
  TeamNameConflictError,
  ValidationError,
} from '@quick-grading/shared-types';
import {
  assignmentKey,
  submissionKey,
  teamKey,
  teamNameLockKey,
  teamsGsi1Pk,
  uploadKey,
} from '../domain/keys.js';
import { ddb, tableName } from './ddb.js';

const TEAM_STATUSES = new Set<TeamStatus>(['OPEN', 'SUBMITTED', 'RESUBMISSION_ALLOWED']);

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toMember(value: unknown): TeamMember {
  const m = (value ?? {}) as Record<string, unknown>;
  const member: TeamMember = {
    memberId: typeof m.memberId === 'string' ? m.memberId : '',
    memberName: typeof m.memberName === 'string' ? m.memberName : '',
    email: typeof m.email === 'string' ? m.email : '',
  };
  const studentCode = optionalString(m.studentCode);
  if (studentCode !== undefined) {
    member.studentCode = studentCode;
  }
  return member;
}

/** Chỉ copy field của `Team` (bỏ PK/SK/GSI/latestSubmissionId/grading...). */
export function toPublicTeam(item: Record<string, unknown>): Team {
  const status = TEAM_STATUSES.has(item.status as TeamStatus)
    ? (item.status as TeamStatus)
    : 'SUBMITTED';
  const team: Team = {
    teamId: String(item.teamId),
    assignmentId: String(item.assignmentId),
    teamName: String(item.teamName),
    teamNameNormalized: String(item.teamNameNormalized),
    members: Array.isArray(item.members) ? item.members.map(toMember) : [],
    status,
    createdAt: String(item.createdAt),
  };
  for (const key of ['createdBy', 'unlockedBy', 'unlockedAt'] as const) {
    const value = optionalString(item[key]);
    if (value !== undefined) {
      team[key] = value;
    }
  }
  return team;
}

/** Tra nhóm theo tên đã chuẩn hoá: GetItem khoá -> GetItem Team. */
export async function findTeamByName(
  assignmentId: string,
  normalizedTeamName: string,
): Promise<Team | undefined> {
  const lock = await ddb().send(
    new GetCommand({
      TableName: tableName(),
      Key: teamNameLockKey(assignmentId, normalizedTeamName),
      ConsistentRead: true,
    }),
  );
  const teamId = lock.Item?.teamId;
  if (typeof teamId !== 'string') {
    return undefined;
  }
  const team = await ddb().send(
    new GetCommand({ TableName: tableName(), Key: teamKey(teamId), ConsistentRead: true }),
  );
  return team.Item === undefined ? undefined : toPublicTeam(team.Item);
}

/** Lấy thông tin nhóm theo teamId. */
export async function getTeam(teamId: string): Promise<Team | undefined> {
  const record = await getTeamRecord(teamId);
  return record;
}

export interface TeamRecord extends Team {
  latestSubmissionId?: string;
  activeGradingAttemptId?: string;
  activeGradingStartedAt?: string;
}

/** Lấy bản ghi đầy đủ của Team từ DynamoDB (gồm cả latestSubmissionId và activeGrading). */
export async function getTeamRecord(teamId: string): Promise<TeamRecord | undefined> {
  const result = await ddb().send(
    new GetCommand({ TableName: tableName(), Key: teamKey(teamId), ConsistentRead: true }),
  );
  if (!result.Item) {
    return undefined;
  }
  const publicTeam = toPublicTeam(result.Item);
  return {
    ...publicTeam,
    latestSubmissionId: optionalString(result.Item.latestSubmissionId),
    activeGradingAttemptId: optionalString(result.Item.activeGradingAttemptId),
    activeGradingStartedAt: optionalString(result.Item.activeGradingStartedAt),
  };
}

export interface StoredFileMeta {
  fileName: string;
  s3Key: string;
  etag: string;
  size: number;
}

export interface SubmissionRecord {
  submissionId: string;
  submittedAt: string;
  files: Record<FileType, StoredFileMeta>;
}

function submissionPut(team: Team, submission: SubmissionRecord) {
  return {
    Put: {
      TableName: tableName(),
      Item: {
        ...submissionKey(team.teamId, submission.submissionId),
        submissionId: submission.submissionId,
        teamId: team.teamId,
        assignmentId: team.assignmentId,
        submittedAt: submission.submittedAt,
        files: submission.files,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    },
  };
}

function userSubmissionHistoryPuts(
  team: Team,
  submission: SubmissionRecord,
  assignmentName: string,
) {
  const uniqueEmails = Array.from(
    new Set(
      team.members.map((m) => m.email.trim().toLowerCase()).filter((email) => email.length > 0),
    ),
  );

  const filesList: SubmissionHistoryFile[] = (['md', 'xml'] as const)
    .filter((ext) => Boolean(submission.files[ext]))
    .map((ext) => ({
      fileName: submission.files[ext].fileName,
      fileType: ext,
      size: submission.files[ext].size,
    }));

  return uniqueEmails.map((email) => ({
    Put: {
      TableName: tableName(),
      Item: {
        PK: `USER#${email}`,
        SK: `SUBMISSION#${submission.submittedAt}#${submission.submissionId}`,
        submissionId: submission.submissionId,
        assignmentId: team.assignmentId,
        assignmentName,
        teamId: team.teamId,
        teamName: team.teamName,
        submittedAt: submission.submittedAt,
        status: team.status,
        members: team.members,
        files: filesList,
      },
    },
  }));
}

function sessionDone(submissionId: string) {
  return {
    Update: {
      TableName: tableName(),
      Key: uploadKey(submissionId),
      UpdateExpression: 'SET #state = :done',
      ConditionExpression: '#state = :pending',
      ExpressionAttributeNames: { '#state': 'state' },
      ExpressionAttributeValues: { ':done': 'DONE', ':pending': 'PENDING' },
    },
  };
}

function assignmentIncrement(assignmentId: string) {
  return {
    Update: {
      TableName: tableName(),
      Key: assignmentKey(assignmentId),
      UpdateExpression: 'ADD submittedTeamCount :one',
      ConditionExpression: '#status = :open',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':one': 1, ':open': 'OPEN' },
    },
  };
}

function assignmentOpenCheck(assignmentId: string) {
  return {
    ConditionCheck: {
      TableName: tableName(),
      Key: assignmentKey(assignmentId),
      ConditionExpression: '#status = :open',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':open': 'OPEN' },
    },
  };
}

/** Map lý do huỷ transaction (theo vị trí item) sang lỗi domain. */
async function runFinalizeTransaction(
  items: NonNullable<TransactWriteCommand['input']['TransactItems']>,
  team: Team,
  submissionId: string,
): Promise<void> {
  try {
    await ddb().send(new TransactWriteCommand({ TransactItems: items }));
  } catch (err) {
    if (
      err instanceof TransactionCanceledException ||
      (err as Error)?.name === 'TransactionCanceledException'
    ) {
      const reasons = (err as TransactionCanceledException).CancellationReasons ?? [];
      const failed = (index: number) => reasons[index]?.Code === 'ConditionalCheckFailed';
      if (failed(0) || failed(1)) {
        throw new TeamNameConflictError(team.teamName, team.assignmentId);
      }
      if (failed(3)) {
        throw new AssignmentClosedError(team.assignmentId);
      }
      if (failed(4)) {
        throw new NotFoundError(
          'UploadSession',
          submissionId,
          'Phiên nộp bài đã hết hạn hoặc đã được hoàn tất, vui lòng nộp lại.',
        );
      }
    }
    throw err;
  }
}

/** Nhóm mới: khoá tên + Team + Submission + tăng đếm + đóng phiên, nguyên tử. */
export async function finalizeNewTeam(
  team: Team,
  submission: SubmissionRecord,
  assignmentName = '',
): Promise<void> {
  const items = [
    {
      Put: {
        TableName: tableName(),
        Item: {
          ...teamNameLockKey(team.assignmentId, team.teamNameNormalized),
          teamId: team.teamId,
          createdAt: team.createdAt,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    {
      Put: {
        TableName: tableName(),
        Item: {
          ...teamKey(team.teamId),
          GSI1PK: teamsGsi1Pk(team.assignmentId),
          GSI1SK: `${team.createdAt}#${team.teamId}`,
          ...team,
          latestSubmissionId: submission.submissionId,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    submissionPut(team, submission),
    assignmentIncrement(team.assignmentId),
    sessionDone(submission.submissionId),
    ...userSubmissionHistoryPuts(team, submission, assignmentName),
  ];
  await runFinalizeTransaction(items, team, submission.submissionId);
}

/**
 * Nộp vào nhóm có sẵn (OPEN chưa từng nộp / RESUBMISSION_ALLOWED đã mở khoá).
 * `observedStatus` là trạng thái đọc được lúc finalize; điều kiện
 * `#status = :observed` chặn 2 lần nộp lại đồng thời.
 * Chỉ lần nộp đầu (OPEN) mới tăng `submittedTeamCount`.
 */
export async function finalizeExistingTeam(
  team: Team,
  observedStatus: 'OPEN' | 'RESUBMISSION_ALLOWED',
  submission: SubmissionRecord,
  assignmentName = '',
): Promise<void> {
  const items = [
    {
      ConditionCheck: {
        TableName: tableName(),
        Key: teamNameLockKey(team.assignmentId, team.teamNameNormalized),
        ConditionExpression: 'teamId = :teamId',
        ExpressionAttributeValues: { ':teamId': team.teamId },
      },
    },
    {
      Update: {
        TableName: tableName(),
        Key: teamKey(team.teamId),
        UpdateExpression:
          'SET #status = :submitted, members = :members, teamName = :teamName, latestSubmissionId = :sid',
        ConditionExpression: '#status = :observed',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: {
          ':submitted': 'SUBMITTED',
          ':members': team.members,
          ':teamName': team.teamName,
          ':sid': submission.submissionId,
          ':observed': observedStatus,
        },
      },
    },
    submissionPut(team, submission),
    observedStatus === 'OPEN'
      ? assignmentIncrement(team.assignmentId)
      : assignmentOpenCheck(team.assignmentId),
    sessionDone(submission.submissionId),
    ...userSubmissionHistoryPuts(team, submission, assignmentName),
  ];
  await runFinalizeTransaction(items, team, submission.submissionId);
}

/** Lấy lịch sử các bài nộp của tài khoản email sinh viên. */
export async function getSubmissionHistoryForUser(email: string): Promise<SubmissionHistoryItem[]> {
  const normEmail = email.trim().toLowerCase();
  const res = await ddb().send(
    new QueryCommand({
      TableName: tableName(),
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `USER#${normEmail}`,
        ':skPrefix': 'SUBMISSION#',
      },
      ScanIndexForward: false,
    }),
  );

  return (res.Items ?? []).map((item) => ({
    submissionId: String(item.submissionId),
    assignmentId: String(item.assignmentId),
    assignmentName: String(item.assignmentName || ''),
    teamId: String(item.teamId),
    teamName: String(item.teamName),
    submittedAt: String(item.submittedAt),
    status: String(item.status || 'SUBMITTED'),
    members: Array.isArray(item.members) ? item.members.map(toMember) : [],
    files: Array.isArray(item.files)
      ? item.files.map((f: Record<string, unknown>) => ({
          fileName: String(f.fileName),
          fileType: f.fileType as FileType,
          size: Number(f.size) || 0,
        }))
      : [],
  }));
}

export async function listTeamsByAssignment(
  assignmentId: string,
  statusFilter?: TeamStatus,
): Promise<Team[]> {
  const result = await ddb().send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gpk',
      ExpressionAttributeValues: {
        ':gpk': teamsGsi1Pk(assignmentId),
      },
      ScanIndexForward: true,
    }),
  );

  let teams = (result.Items ?? []).map(toPublicTeam);
  if (statusFilter && TEAM_STATUSES.has(statusFilter)) {
    teams = teams.filter((t) => t.status === statusFilter);
  }
  return teams;
}

export async function unlockTeamResubmission(teamId: string, unlockedBy: string): Promise<Team> {
  const existing = await getTeam(teamId);
  if (!existing) {
    throw new NotFoundError('Team', teamId);
  }

  if (existing.status !== 'SUBMITTED') {
    throw new ValidationError(
      `Chỉ có thể mở khoá nộp lại cho nhóm đang ở trạng thái SUBMITTED (nhóm hiện tại: ${existing.status}).`,
      'status',
    );
  }

  const now = new Date().toISOString();
  const result = await ddb().send(
    new UpdateCommand({
      TableName: tableName(),
      Key: teamKey(teamId),
      UpdateExpression: 'SET #status = :allowed, unlockedBy = :by, unlockedAt = :at',
      ConditionExpression: 'attribute_exists(PK) AND #status = :submitted',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':allowed': 'RESUBMISSION_ALLOWED',
        ':by': unlockedBy,
        ':at': now,
        ':submitted': 'SUBMITTED',
      },
      ReturnValues: 'ALL_NEW',
    }),
  );

  return toPublicTeam(result.Attributes ?? {});
}

export async function getSubmission(
  teamId: string,
  submissionId: string,
): Promise<SubmissionRecord | undefined> {
  const result = await ddb().send(
    new GetCommand({
      TableName: tableName(),
      Key: submissionKey(teamId, submissionId),
    }),
  );

  if (!result.Item) {
    return undefined;
  }

  return {
    submissionId: String(result.Item.submissionId),
    submittedAt: String(result.Item.submittedAt),
    files: result.Item.files as Record<FileType, StoredFileMeta>,
  };
}
