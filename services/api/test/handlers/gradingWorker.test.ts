import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SQSEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { handler } from '../../src/handlers/gradingWorker.js';
import * as openaiGraderModule from '../../src/grading/openaiGrader.js';
import { _resetConfigRepoCacheForTesting } from '../../src/repositories/configRepo.js';
import { _resetSsmCacheForTesting } from '../../src/config/ssm.js';

describe('gradingWorker handler', () => {
  const ddbMock = mockClient(DynamoDBDocumentClient);
  const s3Mock = mockClient(S3Client);
  const ssmMock = mockClient(SSMClient);

  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    ssmMock.reset();
    _resetConfigRepoCacheForTesting();
    _resetSsmCacheForTesting();
    process.env.TABLE_NAME = 'QuickGrading-dev';
    process.env.STAGE = 'dev';
    process.env.BUCKET_NAME = 'quick-grading-dev-test';
  });

  const sampleEvent: SQSEvent = {
    Records: [
      {
        messageId: 'msg-rec-1',
        receiptHandle: 'handle-1',
        body: JSON.stringify({
          teamId: 't1',
          submissionId: 's1',
          gradingAttemptId: 'att1',
          assignmentId: 'a1',
          model: 'gpt-6.1-sol',
          triggeredBy: 'admin',
        }),
        attributes: {} as never,
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:...',
        awsRegion: 'ap-southeast-1',
      },
    ],
  };

  it('xử lý thành công lượt chấm và trả về batchItemFailures rỗng', async () => {
    // 1. claim attempt thành công
    ddbMock.on(UpdateCommand).resolves({});

    // 2. Active config & rubric
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

    // 3. S3 read
    s3Mock.on(GetObjectCommand).resolves({
      Body: {
        transformToString: async () => '# Báo cáo đồ án\nNội dung',
      } as never,
    });

    // 4. SSM
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'sk-test' } });

    // 5. Mock callOpenAiGrader
    vi.spyOn(openaiGraderModule, 'callOpenAiGrader').mockResolvedValueOnce({
      model: 'gpt-6.1-sol',
      raw: {
        criteria: [{ criterionId: 'c1', score: 90, comment: 'Đạt' }],
        totalScore: 90,
        feedback: 'Tốt lắm',
        needsReview: false,
        needsReviewReason: '',
        confidence: 0.95,
      },
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 500,
        outputTokens: 200,
      },
    });

    // 6. Complete transaction
    ddbMock.on(TransactWriteCommand).resolves({});

    const result = await handler(sampleEvent);
    expect(result.batchItemFailures).toHaveLength(0);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(1);
  });

  it('bỏ qua lượt chấm nếu claim trả về ALREADY_COMPLETED', async () => {
    const condErr = new Error('ConditionalCheckFailed');
    Object.assign(condErr, { name: 'ConditionalCheckFailedException' });
    ddbMock.on(UpdateCommand).rejects(condErr);
    ddbMock.on(GetCommand).resolves({ Item: { status: 'GRADED' } });

    const result = await handler(sampleEvent);
    expect(result.batchItemFailures).toHaveLength(0);
    expect(s3Mock.calls()).toHaveLength(0); // Không đọc S3
  });

  it('lỗi RetryableError đưa messageId vào batchItemFailures để SQS thử lại', async () => {
    ddbMock.on(UpdateCommand).resolves({});
    ddbMock
      .on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'ACTIVE' } })
      .resolves({ Item: { version: 1 } });
    ddbMock.on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'V#1' } }).resolves({
      Item: {
        config: {
          configId: 'default',
          version: 1,
          mode: 'PROMPT',
          systemPrompt: 'Test',
          maxInputTokens: 50000,
          maxOutputTokens: 2000,
          autoGradeOnSubmit: false,
          isActive: true,
          createdAt: '',
          createdBy: '',
        },
      },
    });

    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => 'data' } as never,
    });
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'sk-test' } });

    // Giả lập lỗi RateLimit 429
    vi.spyOn(openaiGraderModule, 'callOpenAiGrader').mockRejectedValueOnce(
      new openaiGraderModule.RetryableError('Rate Limit 429'),
    );

    const result = await handler(sampleEvent);
    expect(result.batchItemFailures).toHaveLength(1);
    expect(result.batchItemFailures[0]?.itemIdentifier).toBe('msg-rec-1');
  });

  it('lỗi PermanentError đánh dấu FAILED và KHÔNG đưa vào batchItemFailures', async () => {
    ddbMock.on(UpdateCommand).resolves({});
    ddbMock
      .on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'ACTIVE' } })
      .resolves({ Item: { version: 1 } });
    ddbMock.on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'V#1' } }).resolves({
      Item: {
        config: {
          configId: 'default',
          version: 1,
          mode: 'PROMPT',
          systemPrompt: 'Test',
          maxInputTokens: 50000,
          maxOutputTokens: 2000,
          autoGradeOnSubmit: false,
          isActive: true,
          createdAt: '',
          createdBy: '',
        },
      },
    });

    s3Mock.on(GetObjectCommand).resolves({
      Body: { transformToString: async () => 'data' } as never,
    });
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: 'sk-test' } });

    // Giả lập lỗi Permanent
    vi.spyOn(openaiGraderModule, 'callOpenAiGrader').mockRejectedValueOnce(
      new openaiGraderModule.PermanentError('Invalid API Key 401'),
    );
    ddbMock.on(TransactWriteCommand).resolves({});

    const result = await handler(sampleEvent);
    expect(result.batchItemFailures).toHaveLength(0);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(1); // Ghi FAILED
  });
});
