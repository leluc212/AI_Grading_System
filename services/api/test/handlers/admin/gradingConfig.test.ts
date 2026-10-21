import { beforeEach, describe, expect, it } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  handleCreateGradingConfig,
  handleGetActiveGradingConfig,
  handleListGradingConfigVersions,
} from '../../../src/handlers/admin/gradingConfig.js';
import { _resetConfigRepoCacheForTesting } from '../../../src/repositories/configRepo.js';

const ddbMock = mockClient(DynamoDBDocumentClient);

process.env.TABLE_NAME = 'QuickGrading-test';
process.env.BUCKET_NAME = 'quick-grading-test';
process.env.STAGE = 'test';

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/api/grading-config',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: '/api/grading-config',
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

describe('admin/gradingConfig handlers', () => {
  beforeEach(() => {
    ddbMock.reset();
    _resetConfigRepoCacheForTesting();
  });

  describe('handleGetActiveGradingConfig', () => {
    it('trả về grading config active nếu có', async () => {
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
              mode: 'RUBRIC',
              maxInputTokens: 50000,
              maxOutputTokens: 2000,
              autoGradeOnSubmit: false,
              isActive: true,
              createdAt: '2026-03-01T00:00:00.000Z',
              createdBy: 'admin',
            },
          },
        });

      const res = await handleGetActiveGradingConfig();
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body!);
      expect(body.version).toBe(1);
      expect(body.mode).toBe('RUBRIC');
    });

    it('trả về null nếu chưa có config active', async () => {
      ddbMock
        .on(GetCommand, { Key: { PK: 'GRADINGCONFIG#default', SK: 'ACTIVE' } })
        .resolves({ Item: undefined });

      const res = await handleGetActiveGradingConfig();
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body!);
      expect(body).toBeNull();
    });
  });

  describe('handleListGradingConfigVersions', () => {
    it('trả về danh sách config sắp xếp theo version tăng dần', async () => {
      ddbMock
        .on(QueryCommand, {
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
          ExpressionAttributeValues: { ':pk': 'GRADINGCONFIG#default', ':prefix': 'V#' },
        })
        .resolves({
          Items: [
            { config: { configId: 'default', version: 2, mode: 'HYBRID', isActive: true } },
            { config: { configId: 'default', version: 1, mode: 'RUBRIC', isActive: false } },
          ],
        });

      const res = await handleListGradingConfigVersions();
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body!);
      expect(body).toHaveLength(2);
      expect(body[0].version).toBe(1);
      expect(body[1].version).toBe(2);
    });
  });

  describe('handleCreateGradingConfig', () => {
    it('tạo và kích hoạt version config mới với mode PROMPT', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      ddbMock.on(TransactWriteCommand).resolves({});

      const event = makeEvent({
        body: JSON.stringify({
          mode: 'PROMPT',
          systemPrompt: 'Hãy chấm bài theo thang điểm 100',
          model: 'gpt-6.1-sol',
          autoGradeOnSubmit: true,
        }),
      });

      const res = await handleCreateGradingConfig(event, 'teacher_thien');
      expect(res.statusCode).toBe(201);

      const body = JSON.parse(res.body!);
      expect(body.version).toBe(1);
      expect(body.mode).toBe('PROMPT');
      expect(body.systemPrompt).toBe('Hãy chấm bài theo thang điểm 100');
      expect(body.model).toBe('gpt-6.1-sol');
      expect(body.autoGradeOnSubmit).toBe(true);
      expect(body.createdBy).toBe('teacher_thien');

      const txCalls = ddbMock.commandCalls(TransactWriteCommand);
      expect(txCalls).toHaveLength(1);
    });

    it('báo lỗi ValidationError nếu mode không hợp lệ', async () => {
      const event = makeEvent({
        body: JSON.stringify({ mode: 'INVALID_MODE' }),
      });

      await expect(handleCreateGradingConfig(event, 'admin')).rejects.toThrow(/mode phải là 1 trong các giá trị/);
    });

    it('báo lỗi ValidationError nếu mode PROMPT nhưng thiếu systemPrompt', async () => {
      const event = makeEvent({
        body: JSON.stringify({ mode: 'PROMPT', systemPrompt: '' }),
      });

      await expect(handleCreateGradingConfig(event, 'admin')).rejects.toThrow(/systemPrompt là bắt buộc/);
    });

    it('báo lỗi ValidationError nếu reasoningEffort không hợp lệ', async () => {
      const event = makeEvent({
        body: JSON.stringify({ mode: 'RUBRIC', reasoningEffort: 'high' }),
      });

      await expect(handleCreateGradingConfig(event, 'admin')).rejects.toThrow(/reasoningEffort phải là/);
    });
  });
});
