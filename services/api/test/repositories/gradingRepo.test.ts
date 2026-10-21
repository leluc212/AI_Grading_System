import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { GradingInProgressError } from '@quick-grading/shared-types';
import {
  lockTeamAndCreateAttempt,
  claimGradingAttempt,
  completeGradingAttempt,
  unlockTeamAndFailAttempt,
  getLatestGradedAttempt,
} from '../../src/repositories/gradingRepo.js';

describe('gradingRepo', () => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'QuickGrading-dev';
    process.env.STAGE = 'dev';
    process.env.BUCKET_NAME = 'quick-grading-dev-test';
  });

  it('lockTeamAndCreateAttempt khóa team và tạo attempt PENDING thành công', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});

    const attempt = await lockTeamAndCreateAttempt({
      teamId: 't1',
      gradingAttemptId: 'att1',
      triggeredBy: 'admin',
      idempotencyKey: 'idemp1',
      rubricVersion: 1,
      gradingConfigVersion: 1,
      model: 'gpt-6.1-sol',
      nowIso: '2026-10-21T00:00:00.000Z',
    });

    expect(attempt.status).toBe('PENDING');
    expect(attempt.teamId).toBe('t1');
    expect(attempt.gradingAttemptId).toBe('att1');
    expect(ddbMock.calls()).toHaveLength(1);
  });

  it('lockTeamAndCreateAttempt ném GradingInProgressError nếu nhóm đang có lượt chấm chạy', async () => {
    const cancelErr = new Error('Transaction cancelled');
    Object.assign(cancelErr, {
      name: 'TransactionCanceledException',
      CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }],
    });

    ddbMock.on(TransactWriteCommand).rejects(cancelErr);

    await expect(
      lockTeamAndCreateAttempt({
        teamId: 't1',
        gradingAttemptId: 'att1',
        triggeredBy: 'admin',
        idempotencyKey: 'idemp1',
        gradingConfigVersion: 1,
        model: 'gpt-6.1-sol',
        nowIso: '2026-10-21T00:00:00.000Z',
      }),
    ).rejects.toThrowError(GradingInProgressError);
  });

  it('claimGradingAttempt chuyển PENDING sang IN_PROGRESS', async () => {
    ddbMock.on(UpdateCommand).resolves({});

    const claim = await claimGradingAttempt('t1', 'att1', '2026-10-21T00:00:00.000Z');
    expect(claim).toBe('CLAIMED');
  });

  it('claimGradingAttempt trả về ALREADY_COMPLETED nếu attempt đã hoàn thành', async () => {
    const condErr = new Error('ConditionalCheckFailed');
    Object.assign(condErr, { name: 'ConditionalCheckFailedException' });

    ddbMock.on(UpdateCommand).rejects(condErr);
    ddbMock.on(GetCommand).resolves({
      Item: { status: 'GRADED' },
    });

    const claim = await claimGradingAttempt('t1', 'att1', '2026-10-21T00:00:00.000Z');
    expect(claim).toBe('ALREADY_COMPLETED');
  });

  it('completeGradingAttempt cập nhật điểm và mở khóa team trong 1 transaction', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});

    await completeGradingAttempt({
      teamId: 't1',
      gradingAttemptId: 'att1',
      status: 'GRADED',
      score: 85,
      aiFeedback: 'Tốt',
      needsReview: false,
      reviewStatus: 'NOT_REQUIRED',
      model: 'gpt-6.1-sol',
    });

    expect(ddbMock.calls()).toHaveLength(1);
  });

  it('unlockTeamAndFailAttempt đánh dấu FAILED và mở khóa team', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});

    await unlockTeamAndFailAttempt('t1', 'att1', 'Lỗi SQS');
    expect(ddbMock.calls()).toHaveLength(1);
  });

  it('getLatestGradedAttempt tìm lượt chấm GRADED mới nhất', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { gradingAttemptId: 'att2', status: 'FAILED' },
        { gradingAttemptId: 'att1', status: 'GRADED', score: 90, idempotencyKey: 'key1' },
      ],
    });

    const latest = await getLatestGradedAttempt('t1');
    expect(latest?.gradingAttemptId).toBe('att1');
    expect(latest?.score).toBe(90);
  });
});
