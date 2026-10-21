import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { getAdminUsername, handler } from '../../src/handlers/adminApi.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

process.env.TABLE_NAME = 'QuickGrading-test';
process.env.BUCKET_NAME = 'quick-grading-test';
process.env.STAGE = 'test';

function makeEvent(
  method: string,
  path: string,
  overrides: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {
      'content-type': 'application/json',
    },
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.com',
      domainPrefix: 'test',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test-agent',
      },
      requestId: 'req-admin-1',
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: '12/Mar/2026:19:00:00 +0000',
      timeEpoch: 1773342000000,
    },
    isBase64Encoded: false,
    ...overrides,
  };
}

describe('adminApi router & handler', () => {
  beforeEach(() => {
    ddbMock.reset();
  });

  describe('getAdminUsername', () => {
    it('lấy username từ cognito:username trong jwt claims', () => {
      const event = makeEvent('GET', '/api/assignments');
      (event.requestContext as unknown as Record<string, unknown>).authorizer = {
        jwt: {
          claims: {
            'cognito:username': 'teacher_lan',
          },
        },
      };
      expect(getAdminUsername(event)).toBe('teacher_lan');
    });

    it('fallback lấy username từ claims.username', () => {
      const event = makeEvent('GET', '/api/assignments');
      (event.requestContext as unknown as Record<string, unknown>).authorizer = {
        jwt: {
          claims: {
            username: 'teacher_hung',
          },
        },
      };
      expect(getAdminUsername(event)).toBe('teacher_hung');
    });

    it('fallback lấy username từ claims.sub', () => {
      const event = makeEvent('GET', '/api/assignments');
      (event.requestContext as unknown as Record<string, unknown>).authorizer = {
        jwt: {
          claims: {
            sub: 'sub-uuid-1234',
          },
        },
      };
      expect(getAdminUsername(event)).toBe('sub-uuid-1234');
    });

    it('fallback về admin nếu không có authorizer claims', () => {
      const event = makeEvent('GET', '/api/assignments');
      expect(getAdminUsername(event)).toBe('admin');
    });
  });

  describe('Router dispatching', () => {
    it('dispatch thành công POST /api/assignments với username lấy từ JWT', async () => {
      ddbMock.on(PutCommand).resolves({});

      const event = makeEvent('POST', '/api/assignments', {
        body: JSON.stringify({ assignmentName: 'Đợt 1 - Kiến Trúc Phần Mềm' }),
      });
      (event.requestContext as unknown as Record<string, unknown>).authorizer = {
        jwt: {
          claims: {
            'cognito:username': 'teacher_thien',
          },
        },
      };

      const res = await handler(event);
      expect(res.statusCode).toBe(201);

      const body = JSON.parse(res.body!);
      expect(body.assignmentName).toBe('Đợt 1 - Kiến Trúc Phần Mềm');
      expect(body.createdBy).toBe('teacher_thien');
    });

    it('dispatch thành công POST /api/rubrics', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteCommand).resolves({});

      const event = makeEvent('POST', '/api/rubrics', {
        body: JSON.stringify({
          criteria: [{ id: 'c1', label: 'Tiêu chí 1' }],
        }),
      });
      (event.requestContext as unknown as Record<string, unknown>).authorizer = {
        jwt: {
          claims: {
            'cognito:username': 'admin_boss',
          },
        },
      };

      const res = await handler(event);
      expect(res.statusCode).toBe(201);

      const body = JSON.parse(res.body!);
      expect(body.version).toBe(1);
      expect(body.criteria).toHaveLength(1);
    });

    it('trả về 404 cho route không được định nghĩa trong admin router', async () => {
      const event = makeEvent('GET', '/api/non-existent-route');

      const res = await handler(event);
      expect(res.statusCode).toBe(404);

      const body = JSON.parse(res.body!);
      expect(body.code).toBe('NOT_FOUND');
    });

    it('xử lý lỗi validation và trả về 400', async () => {
      const event = makeEvent('POST', '/api/assignments', {
        body: JSON.stringify({ assignmentName: '' }),
      });

      const res = await handler(event);
      expect(res.statusCode).toBe(400);

      const body = JSON.parse(res.body!);
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('dispatch thành công GET /api/rubrics/active', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          version: 1,
        },
      });

      const event = makeEvent('GET', '/api/rubrics/active');
      const res = await handler(event);
      expect(res.statusCode).toBe(200);
    });
  });
});
