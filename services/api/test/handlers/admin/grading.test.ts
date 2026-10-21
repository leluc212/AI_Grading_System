import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  handleListGradingHistory,
  handleSubmitReview,
  handleTriggerAssignmentGrading,
  handleTriggerTeamGrading,
} from '../../../src/handlers/admin/grading.js';
import { _resetConfigRepoCacheForTesting } from '../../../src/repositories/configRepo.js';

const ddbMock = mockClient(DynamoDBDocumentClient);
const sqsMock = mockClient(SQSClient);

process.env.TABLE_NAME = 'QuickGrading-test';
process.env.BUCKET_NAME = 'quick-grading-test';
process.env.GRADING_QUEUE_URL = 'https://sqs.ap-southeast-1.amazonaws.com/123/grading-queue';
process.env.STAGE = 'test';

function makeEvent(
  pathParams: Record<string, string> = {},
  overrides: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/api/grading',
    rawQueryString: '',
    headers: {},
    pathParameters: pathParams,
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/api/grading',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      },
      requestId: 'req-1',
      routeKey: '$default',
      stage: '$default',
      time: '12/Mar/2026:19:00:00 +0000',
      timeEpoch: 1773342000000,
    },
    isBase64Encoded: false,
    ...overrides,
  };
}

describe('admin/grading handlers', () => {
  beforeEach(() => {
    ddbMock.reset();
    sqsMock.reset();
    _resetConfigRepoCacheForTesting();
    vi.clearAllMocks();
  });

  describe('handleTriggerTeamGrading', () => {
    it('kích hoạt chấm bài thành công cho nhóm đã nộp đủ 2 file', async () => {
      // 1. Team tồn tại và status SUBMITTED
      ddbMock
        .on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'META' } })
        .resolves({
          Item: {
            teamId: 't1',
            assignmentId: 'a1',
            teamName: 'Nhóm 1',
            status: 'SUBMITTED',
            latestSubmissionId: 'sub-1',
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        });

      // 2. Active GradingConfig
      ddbMock
        .on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'ACTIVE' } })
        .resolves({ Item: { version: 1 } });
      ddbMock
        .on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'V#1' } })
        .resolves({
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

      // 3. Khóa team và tạo attempt PENDING
      ddbMock.on(TransactWriteCommand).resolves({});

      // 4. SQS enqueue
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-1' });

      const event = makeEvent({ teamId: 't1' });
      const res = await handleTriggerTeamGrading(event, 'teacher_thien');

      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body!);
      expect(body.teamId).toBe('t1');
      expect(body.gradingAttemptId).toBeDefined();

      const sqsCalls = sqsMock.commandCalls(SendMessageCommand);
      expect(sqsCalls).toHaveLength(1);
    });

    it('báo lỗi NotFoundError nếu nhóm không tồn tại', async () => {
      ddbMock
        .on(GetCommand, { Key: { PK: 'TEAM#t-none', SK: 'META' } })
        .resolves({ Item: undefined });

      const event = makeEvent({ teamId: 't-none' });
      await expect(handleTriggerTeamGrading(event, 'admin')).rejects.toThrow(/Không tìm thấy/);
    });

    it('báo lỗi ValidationError nếu nhóm chưa nộp bài', async () => {
      ddbMock
        .on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'META' } })
        .resolves({
          Item: {
            teamId: 't1',
            assignmentId: 'a1',
            teamName: 'Nhóm 1',
            status: 'OPEN',
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        });

      const event = makeEvent({ teamId: 't1' });
      await expect(handleTriggerTeamGrading(event, 'admin')).rejects.toThrow(/Chỉ nhóm đã nộp bài/);
    });
  });

  describe('handleTriggerAssignmentGrading', () => {
    it('kích hoạt chấm hàng loạt cho các nhóm SUBMITTED trong đợt', async () => {
      // 1. Assignment tồn tại
      ddbMock
        .on(GetCommand, { Key: { PK: 'ASSIGNMENT#a1', SK: 'META' } })
        .resolves({
          Item: {
            assignmentId: 'a1',
            assignmentName: 'Đợt 1',
            status: 'OPEN',
            createdAt: '2026-03-01T00:00:00.000Z',
            createdBy: 'admin',
          },
        });

      // 2. Query teams trong assignment
      ddbMock
        .on(QueryCommand, {
          KeyConditionExpression: 'GSI1PK = :gpk',
          ExpressionAttributeValues: { ':gpk': 'ASSIGNMENT#a1#TEAMS' },
        })
        .resolves({
          Items: [
            {
              teamId: 't1',
              assignmentId: 'a1',
              teamName: 'Nhóm 1',
              status: 'SUBMITTED',
              createdAt: '2026-03-01T00:00:00.000Z',
            },
          ],
        });

      // 3. Get team record
      ddbMock
        .on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'META' } })
        .resolves({
          Item: {
            teamId: 't1',
            assignmentId: 'a1',
            teamName: 'Nhóm 1',
            status: 'SUBMITTED',
            latestSubmissionId: 'sub-1',
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        });

      // 4. GradingConfig
      ddbMock
        .on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'ACTIVE' } })
        .resolves({ Item: { version: 1 } });
      ddbMock
        .on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'V#1' } })
        .resolves({
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

      // 5. Query latest graded attempt (đối chiếu idempotency)
      ddbMock
        .on(QueryCommand, {
          ExpressionAttributeValues: { ':pk': 'TEAM#t1', ':skPrefix': 'GRADING#' },
        })
        .resolves({ Items: [] });

      // 6. TransactWrite và SQS
      ddbMock.on(TransactWriteCommand).resolves({});
      sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-batch' });

      const event = makeEvent({ assignmentId: 'a1' });
      const res = await handleTriggerAssignmentGrading(event, 'teacher_thien');

      expect(res.statusCode).toBe(202);
      const body = JSON.parse(res.body!);
      expect(body.total).toBe(1);
      expect(body.triggered).toBe(1);
      expect(body.skipped).toBe(0);
      expect(body.failed).toBe(0);
    });

    it('báo lỗi NotFoundError nếu assignment không tồn tại', async () => {
      ddbMock
        .on(GetCommand, { Key: { PK: 'ASSIGNMENT#non-exist', SK: 'META' } })
        .resolves({ Item: undefined });

      const event = makeEvent({ assignmentId: 'non-exist' });
      await expect(handleTriggerAssignmentGrading(event, 'admin')).rejects.toThrow(/Không tìm thấy/);
    });
  });

  describe('handleListGradingHistory', () => {
    it('lấy toàn bộ lịch sử chấm của nhóm theo thứ tự tăng dần', async () => {
      // 1. Team tồn tại
      ddbMock
        .on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'META' } })
        .resolves({
          Item: {
            teamId: 't1',
            assignmentId: 'a1',
            teamName: 'Nhóm 1',
            status: 'SUBMITTED',
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        });

      // 2. Query grading history
      ddbMock
        .on(QueryCommand, {
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
          ExpressionAttributeValues: { ':pk': 'TEAM#t1', ':skPrefix': 'GRADING#' },
        })
        .resolves({
          Items: [
            { gradingAttemptId: 'att-1', teamId: 't1', status: 'FAILED' },
            { gradingAttemptId: 'att-2', teamId: 't1', status: 'GRADED', score: 85 },
          ],
        });

      const event = makeEvent({ teamId: 't1' });
      const res = await handleListGradingHistory(event);

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body!);
      expect(body).toHaveLength(2);
      expect(body[0].gradingAttemptId).toBe('att-1');
      expect(body[1].gradingAttemptId).toBe('att-2');
    });

    it('báo lỗi NotFoundError nếu nhóm không tồn tại khi lấy lịch sử', async () => {
      ddbMock
        .on(GetCommand, { Key: { PK: 'TEAM#t-not-found', SK: 'META' } })
        .resolves({ Item: undefined });

      const event = makeEvent({ teamId: 't-not-found' });
      await expect(handleListGradingHistory(event)).rejects.toThrow(/Không tìm thấy/);
    });
  });

  describe('handleSubmitReview', () => {
    it('giảng viên review và cập nhật finalScore thành công', async () => {
      // 1. Team tồn tại
      ddbMock
        .on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'META' } })
        .resolves({
          Item: {
            teamId: 't1',
            assignmentId: 'a1',
            teamName: 'Nhóm 1',
            status: 'SUBMITTED',
            createdAt: '2026-03-01T00:00:00.000Z',
          },
        });

      // 2. Grading attempt tồn tại
      ddbMock
        .on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'GRADING#att-1' } })
        .resolves({
          Item: {
            gradingAttemptId: 'att-1',
            teamId: 't1',
            status: 'GRADED',
            score: 75,
            reviewStatus: 'PENDING_REVIEW',
          },
        });

      // 3. UpdateCommand cập nhật review
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          gradingAttemptId: 'att-1',
          teamId: 't1',
          status: 'GRADED',
          score: 75,
          finalScore: 85,
          reviewedBy: 'teacher_thien',
          reviewStatus: 'REVIEWED',
        },
      });

      const event = makeEvent(
        { teamId: 't1', gradingAttemptId: 'att-1' },
        {
          body: JSON.stringify({ finalScore: 85 }),
        },
      );

      const res = await handleSubmitReview(event, 'teacher_thien');
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body!);
      expect(body.reviewStatus).toBe('REVIEWED');
      expect(body.finalScore).toBe(85);
      expect(body.reviewedBy).toBe('teacher_thien');
      expect(body.score).toBe(75); // Điểm AI gốc không đổi
    });

    it('báo lỗi ValidationError nếu finalScore âm', async () => {
      ddbMock
        .on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'META' } })
        .resolves({ Item: { teamId: 't1' } });

      const event = makeEvent(
        { teamId: 't1', gradingAttemptId: 'att-1' },
        {
          body: JSON.stringify({ finalScore: -5 }),
        },
      );

      await expect(handleSubmitReview(event, 'teacher_thien')).rejects.toThrow(
        /finalScore phải là số không âm/,
      );
    });

    it('báo lỗi NotFoundError nếu attempt không tồn tại', async () => {
      ddbMock
        .on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'META' } })
        .resolves({ Item: { teamId: 't1' } });

      ddbMock
        .on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'GRADING#att-not-exist' } })
        .resolves({ Item: undefined });

      const event = makeEvent(
        { teamId: 't1', gradingAttemptId: 'att-not-exist' },
        {
          body: JSON.stringify({ finalScore: 80 }),
        },
      );

      await expect(handleSubmitReview(event, 'teacher_thien')).rejects.toThrow(/Không tìm thấy/);
    });
  });
});
