import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { NotFoundError } from '@quick-grading/shared-types';
import { triggerGrading } from '../../src/services/gradingService.js';
import { _resetConfigRepoCacheForTesting } from '../../src/repositories/configRepo.js';
import { _resetSsmCacheForTesting } from '../../src/config/ssm.js';

describe('gradingService', () => {
  const ddbMock = mockClient(DynamoDBDocumentClient);
  const sqsMock = mockClient(SQSClient);
  const ssmMock = mockClient(SSMClient);

  beforeEach(() => {
    ddbMock.reset();
    sqsMock.reset();
    ssmMock.reset();
    _resetConfigRepoCacheForTesting();
    _resetSsmCacheForTesting();
    process.env.TABLE_NAME = 'QuickGrading-dev';
    process.env.STAGE = 'dev';
    process.env.BUCKET_NAME = 'quick-grading-dev-test';
    process.env.GRADING_QUEUE_URL =
      'https://sqs.ap-southeast-1.amazonaws.com/123456789/grading-queue';
  });

  it('quăng NotFoundError nếu team không tồn tại', async () => {
    ddbMock.on(GetCommand).resolves({ Item: undefined });

    await expect(
      triggerGrading({ teamId: 'non-existent', triggeredBy: 'admin' }),
    ).rejects.toThrowError(NotFoundError);
  });

  it('quăng ValidationError nếu team chưa SUBMITTED', async () => {
    ddbMock.on(GetCommand).resolves({
      Item: {
        teamId: 't1',
        status: 'OPEN',
      },
    });

    await expect(triggerGrading({ teamId: 't1', triggeredBy: 'admin' })).rejects.toThrowError(
      /Chỉ nhóm đã nộp bài/,
    );
  });

  it('trigger thành công: khóa team, lưu attempt PENDING và gửi SQS', async () => {
    // 1. Get team
    ddbMock.on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'META' } }).resolves({
      Item: {
        teamId: 't1',
        assignmentId: 'a1',
        teamName: 'Nhóm 1',
        status: 'SUBMITTED',
        latestSubmissionId: 'sub1',
      },
    });

    // 2. Active config
    ddbMock.on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'ACTIVE' } }).resolves({
      Item: { version: 1 },
    });
    ddbMock.on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'V#1' } }).resolves({
      Item: {
        config: {
          configId: 'default',
          version: 1,
          mode: 'RUBRIC',
          maxInputTokens: 50_000,
          maxOutputTokens: 2_000,
          autoGradeOnSubmit: false,
          isActive: true,
          createdAt: '2026-10-01',
          createdBy: 'admin',
        },
      },
    });

    // 3. Active rubric
    ddbMock.on(GetCommand, { Key: { PK: 'RUBRIC#default', SK: 'ACTIVE' } }).resolves({
      Item: { version: 1 },
    });
    ddbMock.on(GetCommand, { Key: { PK: 'RUBRIC#default', SK: 'V#1' } }).resolves({
      Item: {
        rubric: {
          rubricId: 'default',
          version: 1,
          criteria: [{ id: 'c1', label: 'Tốt', weight: 100 }],
        },
      },
    });

    // 4. Query previous graded attempts (empty)
    ddbMock.on(QueryCommand).resolves({ Items: [] });

    // 5. Model from SSM
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'gpt-6.1-sol' } });

    // 6. TransactWrite for lock + attempt
    ddbMock.on(TransactWriteCommand).resolves({});

    // 7. SQS SendMessage
    sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-123' });

    const result = await triggerGrading({ teamId: 't1', triggeredBy: 'admin' });
    expect(result.status).toBe('PENDING');
    expect(result.skipped).toBe(false);
    expect(sqsMock.calls()).toHaveLength(1);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(1);
  });

  it('bỏ qua gửi SQS nếu bài nộp đã có lượt GRADED cùng cấu hình và không ép buộc (force=false)', async () => {
    ddbMock.on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'META' } }).resolves({
      Item: {
        teamId: 't1',
        assignmentId: 'a1',
        status: 'SUBMITTED',
        latestSubmissionId: 'sub1',
      },
    });

    ddbMock
      .on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'ACTIVE' } })
      .resolves({ Item: { version: 1 } });
    ddbMock.on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'V#1' } }).resolves({
      Item: {
        config: {
          configId: 'default',
          version: 1,
          mode: 'RUBRIC',
          maxInputTokens: 50_000,
          maxOutputTokens: 2_000,
          autoGradeOnSubmit: false,
          isActive: true,
          createdAt: '2026-10-01',
          createdBy: 'admin',
        },
      },
    });

    ddbMock
      .on(GetCommand, { Key: { PK: 'RUBRIC#default', SK: 'ACTIVE' } })
      .resolves({ Item: { version: 1 } });
    ddbMock.on(GetCommand, { Key: { PK: 'RUBRIC#default', SK: 'V#1' } }).resolves({
      Item: {
        rubric: {
          rubricId: 'default',
          version: 1,
          criteria: [{ id: 'c1', label: 'Tốt', weight: 100 }],
        },
      },
    });

    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'gpt-6.1-sol' } });

    // Tính trước idempotencyKey kỳ vọng để mock bản ghi GRADED
    // sha256('t1|sub1|1|1|gpt-6.1-sol')
    const { createHash } = await import('node:crypto');
    const expectedKey = createHash('sha256').update('t1|sub1|1|1|gpt-6.1-sol').digest('hex');

    ddbMock.on(QueryCommand).resolves({
      Items: [
        {
          gradingAttemptId: 'att-old-1',
          status: 'GRADED',
          idempotencyKey: expectedKey,
        },
      ],
    });

    const result = await triggerGrading({ teamId: 't1', triggeredBy: 'admin', force: false });
    expect(result.skipped).toBe(true);
    expect(result.gradingAttemptId).toBe('att-old-1');
    expect(sqsMock.calls()).toHaveLength(0); // Không gửi SQS
  });

  it('bù trừ mở khóa và đánh dấu FAILED nếu gửi SQS thất bại', async () => {
    ddbMock.on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'META' } }).resolves({
      Item: {
        teamId: 't1',
        assignmentId: 'a1',
        status: 'SUBMITTED',
        latestSubmissionId: 'sub1',
      },
    });

    ddbMock
      .on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'ACTIVE' } })
      .resolves({ Item: { version: 1 } });
    ddbMock.on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'V#1' } }).resolves({
      Item: {
        config: {
          configId: 'default',
          version: 1,
          mode: 'RUBRIC',
          maxInputTokens: 50_000,
          maxOutputTokens: 2_000,
          autoGradeOnSubmit: false,
          isActive: true,
          createdAt: '2026-10-01',
          createdBy: 'admin',
        },
      },
    });

    ddbMock
      .on(GetCommand, { Key: { PK: 'RUBRIC#default', SK: 'ACTIVE' } })
      .resolves({ Item: { version: 1 } });
    ddbMock.on(GetCommand, { Key: { PK: 'RUBRIC#default', SK: 'V#1' } }).resolves({
      Item: {
        rubric: {
          rubricId: 'default',
          version: 1,
          criteria: [{ id: 'c1', label: 'Tốt', weight: 100 }],
        },
      },
    });

    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'gpt-6.1-sol' } });
    ddbMock.on(QueryCommand).resolves({ Items: [] });
    ddbMock.on(TransactWriteCommand).resolves({});

    // SQS lỗi
    sqsMock.on(SendMessageCommand).rejects(new Error('SQS Queue Not Found'));

    await expect(triggerGrading({ teamId: 't1', triggeredBy: 'admin' })).rejects.toThrowError(
      'SQS Queue Not Found',
    );

    // Phải có 2 lần gọi TransactWrite: lần 1 lock, lần 2 bù trừ mở khóa
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(2);
  });
});
