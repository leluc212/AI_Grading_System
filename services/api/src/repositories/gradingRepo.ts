/**
 * Repository quản lý lượt chấm bài (GRADING) và khóa chấm nhóm (infra-plan mục 4.1, 6.5).
 */
import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { GradingInProgressError, NotFoundError } from '@quick-grading/shared-types';
import type {
  GradingResult,
  ReviewStatus,
  CriterionScore,
  GradingUsage,
} from '@quick-grading/shared-types';
import { getDdbDocClient } from './ddb.js';
import { readEnv } from '../lib/env.js';
import { teamKey } from '../domain/keys.js';
import { gradingAttemptKey } from '../domain/gradingKeys.js';

export interface LockTeamAndCreateAttemptParams {
  teamId: string;
  gradingAttemptId: string;
  triggeredBy: string;
  idempotencyKey: string;
  rubricVersion?: number;
  gradingConfigVersion: number;
  model: string;
  nowIso: string;
}

export interface CompleteGradingAttemptParams {
  teamId: string;
  gradingAttemptId: string;
  status: 'GRADED' | 'FAILED';
  score?: number;
  aiFeedback?: string;
  needsReview?: boolean;
  reviewStatus?: ReviewStatus;
  criteriaScores?: CriterionScore[];
  usage?: GradingUsage;
  errorMessage?: string;
  model?: string;
  truncated?: boolean;
}

export type ClaimResult = 'CLAIMED' | 'ALREADY_COMPLETED' | 'IN_PROGRESS';

/**
 * Khóa nhóm và tạo lượt chấm PENDING trong 1 transaction (Property 3).
 * Nếu nhóm đang có lượt chấm trong vòng 15 phút -> ném GradingInProgressError.
 */
export async function lockTeamAndCreateAttempt({
  teamId,
  gradingAttemptId,
  triggeredBy,
  idempotencyKey,
  rubricVersion,
  gradingConfigVersion,
  model,
  nowIso,
}: LockTeamAndCreateAttemptParams): Promise<GradingResult> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  // 15 phút timeout cho khóa
  const lockTimeoutIso = new Date(Date.parse(nowIso) - 15 * 60 * 1000).toISOString();

  const attemptItem: GradingResult = {
    teamId,
    gradingAttemptId,
    status: 'PENDING',
    needsReview: false,
    reviewStatus: 'NOT_REQUIRED',
    triggeredBy,
    idempotencyKey,
    rubricVersion,
    gradingConfigVersion,
    model,
  };

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          // 0: Khóa team
          {
            Update: {
              TableName: tableName,
              Key: teamKey(teamId),
              UpdateExpression:
                'SET activeGradingAttemptId = :attemptId, activeGradingStartedAt = :now',
              ConditionExpression:
                'attribute_not_exists(activeGradingAttemptId) OR activeGradingStartedAt < :lockTimeoutIso',
              ExpressionAttributeValues: {
                ':attemptId': gradingAttemptId,
                ':now': nowIso,
                ':lockTimeoutIso': lockTimeoutIso,
              },
            },
          },
          // 1: Tạo attempt PENDING
          {
            Put: {
              TableName: tableName,
              Item: {
                ...gradingAttemptKey(teamId, gradingAttemptId),
                ...attemptItem,
                createdAt: nowIso,
              },
            },
          },
        ],
      }),
    );

    return attemptItem;
  } catch (err: unknown) {
    const errorObj = err as { name?: string; CancellationReasons?: Array<{ Code?: string }> };
    if (
      errorObj.name === 'TransactionCanceledException' &&
      errorObj.CancellationReasons?.[0]?.Code === 'ConditionalCheckFailed'
    ) {
      throw new GradingInProgressError(teamId);
    }
    throw err;
  }
}

/**
 * Worker nhận message SQS chuyển PENDING -> IN_PROGRESS.
 * Đảm bảo tính idempotent: không bao giờ gọi OpenAI 2 lần cho cùng 1 attempt.
 */
export async function claimGradingAttempt(
  teamId: string,
  gradingAttemptId: string,
  nowIso: string,
): Promise<ClaimResult> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  // 130 giây timeout cho trạng thái IN_PROGRESS
  const timeoutIso = new Date(Date.parse(nowIso) - 130 * 1000).toISOString();

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tableName,
        Key: gradingAttemptKey(teamId, gradingAttemptId),
        UpdateExpression: 'SET #st = :inProgress, startedAt = :now',
        ConditionExpression: '#st = :pending OR (#st = :inProgress AND startedAt < :timeoutIso)',
        ExpressionAttributeNames: { '#st': 'status' },
        ExpressionAttributeValues: {
          ':inProgress': 'IN_PROGRESS',
          ':pending': 'PENDING',
          ':now': nowIso,
          ':timeoutIso': timeoutIso,
        },
      }),
    );
    return 'CLAIMED';
  } catch (err: unknown) {
    const errorObj = err as { name?: string };
    if (errorObj.name === 'ConditionalCheckFailedException') {
      // Đọc trạng thái hiện tại
      const current = await getGradingAttempt(teamId, gradingAttemptId);
      if (current?.status === 'GRADED' || current?.status === 'FAILED') {
        return 'ALREADY_COMPLETED';
      }
      return 'IN_PROGRESS';
    }
    throw err;
  }
}

/**
 * Đọc chi tiết 1 lượt chấm.
 */
export async function getGradingAttempt(
  teamId: string,
  gradingAttemptId: string,
): Promise<GradingResult | undefined> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  const res = await ddb.send(
    new GetCommand({
      TableName: tableName,
      Key: gradingAttemptKey(teamId, gradingAttemptId),
    }),
  );

  return res?.Item as GradingResult | undefined;
}

/**
 * Hoàn tất lượt chấm (GRADED hoặc FAILED) và mở khóa team trong 1 transaction.
 */
export async function completeGradingAttempt({
  teamId,
  gradingAttemptId,
  status,
  score,
  aiFeedback,
  needsReview,
  reviewStatus,
  criteriaScores,
  usage,
  errorMessage,
  model,
  truncated,
}: CompleteGradingAttemptParams): Promise<void> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  const nowIso = new Date().toISOString();

  const updateExpressions: string[] = ['#st = :status', 'gradedAt = :now'];
  const exprNames: Record<string, string> = { '#st': 'status' };
  const exprValues: Record<string, unknown> = {
    ':status': status,
    ':now': nowIso,
  };

  if (score !== undefined) {
    updateExpressions.push('score = :score');
    exprValues[':score'] = score;
  }
  if (aiFeedback !== undefined) {
    updateExpressions.push('aiFeedback = :aiFeedback');
    exprValues[':aiFeedback'] = aiFeedback;
  }
  if (needsReview !== undefined) {
    updateExpressions.push('needsReview = :needsReview');
    exprValues[':needsReview'] = needsReview;
  }
  if (reviewStatus !== undefined) {
    updateExpressions.push('reviewStatus = :reviewStatus');
    exprValues[':reviewStatus'] = reviewStatus;
  }
  if (criteriaScores !== undefined) {
    updateExpressions.push('criteriaScores = :criteriaScores');
    exprValues[':criteriaScores'] = criteriaScores;
  }
  if (usage !== undefined) {
    updateExpressions.push('#us = :usage');
    exprNames['#us'] = 'usage';
    exprValues[':usage'] = usage;
  }
  if (errorMessage !== undefined) {
    updateExpressions.push('errorMessage = :errorMessage');
    exprValues[':errorMessage'] = errorMessage;
  }
  if (model !== undefined) {
    updateExpressions.push('model = :model');
    exprValues[':model'] = model;
  }
  if (truncated !== undefined) {
    updateExpressions.push('truncated = :truncated');
    exprValues[':truncated'] = truncated;
  }

  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        // 0: Cập nhật attempt
        {
          Update: {
            TableName: tableName,
            Key: gradingAttemptKey(teamId, gradingAttemptId),
            UpdateExpression: `SET ${updateExpressions.join(', ')}`,
            ExpressionAttributeNames: exprNames,
            ExpressionAttributeValues: exprValues,
          },
        },
        // 1: Mở khóa team
        {
          Update: {
            TableName: tableName,
            Key: teamKey(teamId),
            UpdateExpression: 'REMOVE activeGradingAttemptId, activeGradingStartedAt',
            ConditionExpression: 'activeGradingAttemptId = :attemptId',
            ExpressionAttributeValues: {
              ':attemptId': gradingAttemptId,
            },
          },
        },
      ],
    }),
  );
}

/**
 * Mở khóa team và đánh dấu attempt FAILED khi gặp lỗi ngoài luồng (như gửi SQS thất bại).
 */
export async function unlockTeamAndFailAttempt(
  teamId: string,
  gradingAttemptId: string,
  errorMessage: string,
): Promise<void> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Update: {
              TableName: tableName,
              Key: gradingAttemptKey(teamId, gradingAttemptId),
              UpdateExpression: 'SET #st = :failed, errorMessage = :em',
              ExpressionAttributeNames: { '#st': 'status' },
              ExpressionAttributeValues: {
                ':failed': 'FAILED',
                ':em': errorMessage,
              },
            },
          },
          {
            Update: {
              TableName: tableName,
              Key: teamKey(teamId),
              UpdateExpression: 'REMOVE activeGradingAttemptId, activeGradingStartedAt',
              ConditionExpression: 'activeGradingAttemptId = :attemptId',
              ExpressionAttributeValues: {
                ':attemptId': gradingAttemptId,
              },
            },
          },
        ],
      }),
    );
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Tìm lượt chấm gần nhất đã GRADED của nhóm để đối chiếu idempotencyKey.
 */
export async function getLatestGradedAttempt(teamId: string): Promise<GradingResult | undefined> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `TEAM#${teamId}`,
        ':skPrefix': 'GRADING#',
      },
      ScanIndexForward: false, // Mới nhất trước
      Limit: 10,
    }),
  );

  const items = (res.Items ?? []) as GradingResult[];
  return items.find((item) => item.status === 'GRADED');
}

/**
 * Lấy toàn bộ lịch sử chấm của một nhóm (sắp xếp tăng dần theo thời gian tạo).
 */
export async function listGradingHistory(teamId: string): Promise<GradingResult[]> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': `TEAM#${teamId}`,
        ':skPrefix': 'GRADING#',
      },
      ScanIndexForward: true, // Thứ tự thời gian tăng dần
    }),
  );

  return (res.Items ?? []) as GradingResult[];
}

export interface SubmitReviewParams {
  teamId: string;
  gradingAttemptId: string;
  reviewedBy: string;
  finalScore?: number;
}

/**
 * Giảng viên review kết quả chấm: cập nhật reviewStatus = 'REVIEWED', reviewedBy, finalScore (nếu sửa).
 */
export async function submitReview({
  teamId,
  gradingAttemptId,
  reviewedBy,
  finalScore,
}: SubmitReviewParams): Promise<GradingResult> {
  const ddb = getDdbDocClient();
  const { tableName } = readEnv();

  const existing = await getGradingAttempt(teamId, gradingAttemptId);
  if (!existing) {
    throw new NotFoundError('GradingResult', gradingAttemptId);
  }

  const updateExpressions: string[] = ['reviewStatus = :rs', 'reviewedBy = :rb'];
  const exprValues: Record<string, unknown> = {
    ':rs': 'REVIEWED',
    ':rb': reviewedBy,
  };

  if (finalScore !== undefined) {
    updateExpressions.push('finalScore = :fs');
    exprValues[':fs'] = finalScore;
  }

  const result = await ddb.send(
    new UpdateCommand({
      TableName: tableName,
      Key: gradingAttemptKey(teamId, gradingAttemptId),
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ConditionExpression: 'attribute_exists(PK)',
      ExpressionAttributeValues: exprValues,
      ReturnValues: 'ALL_NEW',
    }),
  );

  return result.Attributes as GradingResult;
}
