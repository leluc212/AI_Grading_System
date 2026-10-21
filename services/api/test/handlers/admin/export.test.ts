import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  handleExportAssignmentData,
  NOT_GRADED_LABEL,
} from '../../../src/handlers/admin/export.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

process.env.TABLE_NAME = 'QuickGrading-test';
process.env.BUCKET_NAME = 'quick-grading-test';
process.env.STAGE = 'test';

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/api/assignments/a1/export-data',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: '/api/assignments/a1/export-data',
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

describe('admin/export handler', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  it('xuất bảng điểm thành công với cả nhóm đã chấm và chưa chấm', async () => {
    // 1. Get assignment
    ddbMock.on(GetCommand, { Key: { PK: 'ASSIGNMENT#a1', SK: 'META' } }).resolves({
      Item: {
        assignmentId: 'a1',
        assignmentName: 'Đồ Án Cuối Kỳ',
        status: 'OPEN',
        createdAt: '2026-03-01T00:00:00.000Z',
        createdBy: 'admin',
        submittedTeamCount: 2,
      },
    });

    // 2. Query teams
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
            teamName: 'Alpha Team',
            teamNameNormalized: 'alpha team',
            members: [
              {
                memberId: 'm1',
                memberName: 'Nguyễn Văn A',
                studentCode: 'SV001',
                email: 'a@sv.edu.vn',
              },
              { memberId: 'm2', memberName: 'Trần Thị B', email: 'b@sv.edu.vn' },
            ],
            status: 'SUBMITTED',
            createdAt: '2026-03-01T01:00:00.000Z',
          },
          {
            teamId: 't2',
            assignmentId: 'a1',
            teamName: 'Beta Team',
            teamNameNormalized: 'beta team',
            members: [
              {
                memberId: 'm3',
                memberName: 'Lê Văn C',
                studentCode: 'SV002',
                email: 'c@sv.edu.vn',
              },
            ],
            status: 'SUBMITTED',
            createdAt: '2026-03-01T02:00:00.000Z',
          },
        ],
      });

    // 3. Query grading attempts
    // Team t1: có bài chấm GRADED 85 điểm
    ddbMock
      .on(QueryCommand, {
        ExpressionAttributeValues: { ':pk': 'TEAM#t1', ':skPrefix': 'GRADING#' },
      })
      .resolves({
        Items: [
          {
            gradingAttemptId: 'ga-1',
            teamId: 't1',
            status: 'GRADED',
            finalScore: 85,
            reviewStatus: 'APPROVED',
            gradedAt: '2026-03-02T10:00:00.000Z',
          },
        ],
      });

    // Team t2: chưa chấm (không có grading attempt)
    ddbMock
      .on(QueryCommand, {
        ExpressionAttributeValues: { ':pk': 'TEAM#t2', ':skPrefix': 'GRADING#' },
      })
      .resolves({
        Items: [],
      });

    const event = makeEvent({
      pathParameters: { assignmentId: 'a1' },
    });

    const res = await handleExportAssignmentData(event);
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body!);
    expect(body.assignmentId).toBe('a1');
    expect(body.assignmentName).toBe('Đồ Án Cuối Kỳ');
    expect(body.rows).toHaveLength(2);

    // Row 1: Alpha Team (Đã chấm)
    const row1 = body.rows[0];
    expect(row1.teamName).toBe('Alpha Team');
    expect(row1.finalDisplayScore).toBe(85);
    expect(row1.reviewStatus).toBe('APPROVED');
    expect(row1.gradedAt).toBe('2026-03-02T10:00:00.000Z');
    expect(row1.members).toEqual([
      { memberName: 'Nguyễn Văn A', studentCode: 'SV001' },
      { memberName: 'Trần Thị B' },
    ]);

    // Row 2: Beta Team (Chưa chấm)
    const row2 = body.rows[1];
    expect(row2.teamName).toBe('Beta Team');
    expect(row2.finalDisplayScore).toBe(NOT_GRADED_LABEL);
    expect(row2.reviewStatus).toBeNull();
    expect(row2.gradedAt).toBeNull();
    expect(row2.members).toEqual([{ memberName: 'Lê Văn C', studentCode: 'SV002' }]);
  });

  it('báo lỗi NotFoundError nếu assignment không tồn tại', async () => {
    ddbMock
      .on(GetCommand, { Key: { PK: 'ASSIGNMENT#non-existent', SK: 'META' } })
      .resolves({ Item: undefined });

    const event = makeEvent({
      pathParameters: { assignmentId: 'non-existent' },
    });

    await expect(handleExportAssignmentData(event)).rejects.toThrow(/Không tìm thấy/);
  });
});
