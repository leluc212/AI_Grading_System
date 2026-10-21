import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  handleCreateRubric,
  handleGetActiveRubric,
  handleListRubricVersions,
} from '../../../src/handlers/admin/rubrics.js';
import { _resetConfigRepoCacheForTesting } from '../../../src/repositories/configRepo.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

process.env.TABLE_NAME = 'QuickGrading-test';
process.env.BUCKET_NAME = 'quick-grading-test';
process.env.STAGE = 'test';

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/api/rubrics',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: '/api/rubrics',
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

describe('admin/rubrics handlers', () => {
  beforeEach(() => {
    ddbMock.reset();
    _resetConfigRepoCacheForTesting();
  });

  describe('handleGetActiveRubric', () => {
    it('trả về rubric active nếu có trong DB', async () => {
      ddbMock
        .on(GetCommand, { Key: { PK: 'RUBRIC#default', SK: 'ACTIVE' } })
        .resolves({ Item: { version: 1 } });

      ddbMock
        .on(GetCommand, { Key: { PK: 'RUBRIC#default', SK: 'V#1' } })
        .resolves({
          Item: {
            rubric: {
              rubricId: 'r1',
              version: 1,
              criteria: [{ id: 'c1', label: 'Tính đúng đắn' }],
              isActive: true,
              createdAt: '2026-03-01T00:00:00.000Z',
              updatedAt: '2026-03-01T00:00:00.000Z',
            },
          },
        });

      const res = await handleGetActiveRubric();
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body!);
      expect(body.version).toBe(1);
      expect(body.criteria).toHaveLength(1);
      expect(body.criteria[0].label).toBe('Tính đúng đắn');
    });

    it('trả về null nếu chưa có rubric active', async () => {
      ddbMock
        .on(GetCommand, { Key: { PK: 'RUBRIC#default', SK: 'ACTIVE' } })
        .resolves({ Item: undefined });

      const res = await handleGetActiveRubric();
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body!);
      expect(body).toBeNull();
    });
  });

  describe('handleListRubricVersions', () => {
    it('trả về danh sách rubric sắp xếp theo version tăng dần', async () => {
      ddbMock
        .on(QueryCommand, {
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': 'RUBRIC#default', ':prefix': 'V#' },
        })
        .resolves({
          Items: [
            {
              rubric: {
                rubricId: 'r2',
                version: 2,
                criteria: [],
                isActive: true,
              },
            },
            {
              rubric: {
                rubricId: 'r1',
                version: 1,
                criteria: [],
                isActive: false,
              },
            },
          ],
        });

      const res = await handleListRubricVersions();
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body!);
      expect(body).toHaveLength(2);
      expect(body[0].version).toBe(1);
      expect(body[1].version).toBe(2);
    });
  });

  describe('handleCreateRubric', () => {
    it('tạo và kích hoạt version rubric mới (tăng version tự động)', async () => {
      // 1. Query versions để tìm maxVersion
      ddbMock
        .on(QueryCommand)
        .resolves({
          Items: [
            { rubric: { rubricId: 'r1', version: 1, criteria: [], isActive: true } },
          ],
        });

      // 2. TransactWriteCommand để lưu V#2 và ACTIVE
      ddbMock.on(TransactWriteCommand).resolves({});

      const event = makeEvent({
        body: JSON.stringify({
          criteria: [
            { id: 'c1', label: 'Cấu trúc bài', weight: 40 },
            { id: 'c2', label: 'Chất lượng code', weight: 60, description: 'Code sạch' },
          ],
        }),
      });

      const res = await handleCreateRubric(event);
      expect(res.statusCode).toBe(201);

      const body = JSON.parse(res.body!);
      expect(body.version).toBe(2);
      expect(body.isActive).toBe(true);
      expect(body.criteria).toHaveLength(2);
      expect(body.criteria[0].id).toBe('c1');
      expect(body.criteria[0].weight).toBe(40);
      expect(body.criteria[1].description).toBe('Code sạch');

      const txCalls = ddbMock.commandCalls(TransactWriteCommand);
      expect(txCalls).toHaveLength(1);
    });

    it('báo lỗi ValidationError nếu criteria rỗng', async () => {
      const event = makeEvent({
        body: JSON.stringify({ criteria: [] }),
      });

      await expect(handleCreateRubric(event)).rejects.toThrow(/criteria phải là một mảng không rỗng/);
    });

    it('báo lỗi ValidationError nếu criterion thiếu id hoặc label', async () => {
      const event = makeEvent({
        body: JSON.stringify({
          criteria: [{ id: '', label: 'Tiêu chí 1' }],
        }),
      });

      await expect(handleCreateRubric(event)).rejects.toThrow(/id là bắt buộc/);
    });
  });
});
