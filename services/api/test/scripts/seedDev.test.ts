import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildAssignmentItem,
  SEED_ASSIGNMENTS,
  seedDevAssignments,
} from '../../scripts/seed-dev.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('seed-dev script', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it('buildAssignmentItem tạo đúng cấu trúc item và GSI1', () => {
    const item = buildAssignmentItem(SEED_ASSIGNMENTS[0]);
    expect(item).toEqual({
      PK: 'ASSIGNMENT#a1111111-1111-4111-8111-111111111111',
      SK: 'META',
      GSI1PK: 'ASSIGNMENTS',
      GSI1SK: '2024-09-01T08:00:00.000Z',
      assignmentId: 'a1111111-1111-4111-8111-111111111111',
      assignmentName: 'Đợt 1 - Lập trình Web - K21',
      status: 'OPEN',
      createdAt: '2024-09-01T08:00:00.000Z',
      createdBy: 'admin',
      submittedTeamCount: 0,
    });
  });

  it('từ chối chạy nếu tên bảng khác QuickGrading-dev', async () => {
    await expect(seedDevAssignments('QuickGrading-prod')).rejects.toThrow(
      /An toàn: seed:dev chỉ chạy trên bảng 'QuickGrading-dev'/,
    );
  });

  it('gọi PutCommand với ConditionExpression attribute_not_exists(PK)', async () => {
    ddbMock.on(PutCommand).resolves({});

    await seedDevAssignments('QuickGrading-dev');

    const calls = ddbMock.commandCalls(PutCommand);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.args[0].input.TableName).toBe('QuickGrading-dev');
      expect(call.args[0].input.ConditionExpression).toBe('attribute_not_exists(PK)');
    }
  });

  it('bỏ qua khi ConditionalCheckFailedException (idempotent)', async () => {
    const error = new Error('ConditionalCheckFailed');
    error.name = 'ConditionalCheckFailedException';
    ddbMock.on(PutCommand).rejects(error);

    // Không ném lỗi ra ngoài khi bản ghi đã tồn tại
    await expect(seedDevAssignments('QuickGrading-dev')).resolves.toBeUndefined();
  });
});
