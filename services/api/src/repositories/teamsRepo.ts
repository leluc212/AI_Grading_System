/**
 * Team + khoá tên nhóm + transaction finalize (infra-plan mục 4.1, 5).
 *
 * Property 1 (không có 2 nhóm cùng tên trong 1 đợt) được giữ bằng item khoá
 * `ASSIGNMENT#{aid}` / `TEAMNAME#{normalized}` ghi với điều kiện
 * `attribute_not_exists(PK)` trong CÙNG transaction với Team + Submission, nên
 * 2 finalize đồng thời cùng tên chỉ 1 cái thắng.
 */
import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { FileType, Team, TeamMember, TeamStatus } from '@quick-grading/shared-types';
import {
  AssignmentClosedError,
  NotFoundError,
  TeamNameConflictError,
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

const TEAM_STATUSES: readonly TeamStatus[] = ['OPEN', 'SUBMITTED', 'RESUBMISSION_ALLOWED'];

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function toMember(value: unknown): TeamMember {
  const m = (value ?? {}) as Record<string, unknown>;
  const member: TeamMember = {
    memberId: String(m.memberId ?? ''),
    memberName: String(m.memberName ?? ''),
    email: String(m.email ?? ''),
  };
  const studentCode = optionalString(m.studentCode);
  if (studentCode !== undefined) {
    member.studentCode = studentCode;
  }
  return member;
}

/** Chỉ copy field của `Team` (bỏ PK/SK/GSI/latestSubmissionId/grading...). */
export function toPublicTeam(item: Record<string, unknown>): Team {
  const status = TEAM_STATUSES.includes(item.status as TeamStatus)
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
export async function finalizeNewTeam(team: Team, submission: SubmissionRecord): Promise<void> {
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
  ];
  await runFinalizeTransaction(items, team, submission.submissionId);
}
