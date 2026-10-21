import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  handleCreateAssignment,
  handleSetAssignmentStatus,
} from '../../../src/handlers/admin/assignments.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

process.env.TABLE_NAME = 'QuickGrading-test';
process.env.BUCKET_NAME = 'quick-grading-test';
process.env.STAGE = 'test';

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/api/assignments',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/api/assignments',
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

describe('admin/assignments handlers', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('handleCreateAssignment', () => {
    it('tạo assignment thành công với status OPEN và createdBy từ JWT', async () => {
      ddbMock.on(PutCommand).resolves({});

      const event = makeEvent({
        body: JSON.stringify({ assignmentName: 'Đợt Kiểm Thử Phần Mềm' }),
      });

      const res = await handleCreateAssignment(event, 'teacher_thien');
      expect(res.statusCode).toBe(201);

      const body = JSON.parse(res.body!);
      expect(body.assignmentName).toBe('Đợt Kiểm Thử Phần Mềm');
      expect(body.status).toBe('OPEN');
      expect(body.createdBy).toBe('teacher_thien');
      expect(body.assignmentId).toBeDefined();

      const putCalls = ddbMock.commandCalls(PutCommand);
      expect(putCalls).toHaveLength(1);
      expect(putCalls[0].args[0].input.Item?.createdBy).toBe('teacher_thien');
    });

    it('báo lỗi ValidationError nếu assignmentName rỗng', async () => {
      const event = makeEvent({
        body: JSON.stringify({ assignmentName: '   ' }),
      });

      await expect(handleCreateAssignment(event, 'admin')).rejects.toThrow(/không được để trống/);
    });

    it('báo lỗi ValidationError nếu assignmentName > 100 ký tự', async () => {
      const event = makeEvent({
        body: JSON.stringify({ assignmentName: 'a'.repeat(101) }),
      });

      await expect(handleCreateAssignment(event, 'admin')).rejects.toThrow(
        /không được vượt quá 100/,
      );
    });
  });

  describe('handleSetAssignmentStatus', () => {
    it('cập nhật trạng thái thành công sang CLOSED', async () => {
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          assignmentId: 'a1',
          assignmentName: 'Đợt 1',
          status: 'CLOSED',
          createdAt: '2026-01-01T00:00:00.000Z',
          createdBy: 'admin',
          submittedTeamCount: 5,
        },
      });

      const event = makeEvent({
        pathParameters: { assignmentId: 'a1' },
        body: JSON.stringify({ status: 'CLOSED' }),
      });

      const res = await handleSetAssignmentStatus(event);
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body!);
      expect(body.status).toBe('CLOSED');
      expect(body.assignmentId).toBe('a1');
    });

    it('báo lỗi ValidationError nếu status không hợp lệ', async () => {
      const event = makeEvent({
        pathParameters: { assignmentId: 'a1' },
        body: JSON.stringify({ status: 'INVALID_STATUS' }),
      });

      await expect(handleSetAssignmentStatus(event)).rejects.toThrow(/status phải là 1 trong/);
    });

    it('báo lỗi NotFoundError nếu assignment không tồn tại', async () => {
      const err = new Error('ConditionalCheckFailed');
      err.name = 'ConditionalCheckFailedException';
      ddbMock.on(UpdateCommand).rejects(err);

      const event = makeEvent({
        pathParameters: { assignmentId: 'non-existent' },
        body: JSON.stringify({ status: 'CLOSED' }),
      });

      await expect(handleSetAssignmentStatus(event)).rejects.toThrow(/Không tìm thấy/);
    });
  });
});
