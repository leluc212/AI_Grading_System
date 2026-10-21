import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  handleGetTeam,
  handleGetTeamFiles,
  handleListTeams,
  handleUnlockTeam,
} from '../../../src/handlers/admin/teams.js';

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockImplementation(async (_client, command) => {
    const key = command.input.Key;
    return `https://s3.example.com/download/${key}?signature=mock-signature`;
  }),
}));

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

process.env.TABLE_NAME = 'QuickGrading-test';
process.env.BUCKET_NAME = 'quick-grading-test';
process.env.STAGE = 'test';

function makeEvent(overrides: Partial<APIGatewayProxyEventV2> = {}): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: '/api/teams',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'test.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: '/api/teams',
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

describe('admin/teams handlers', () => {
  beforeEach(() => {
    ddbMock.reset();
    s3Mock.reset();
    vi.clearAllMocks();
  });

  describe('handleListTeams', () => {
    it('trả về danh sách nhóm của assignment', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            teamId: 't1',
            assignmentId: 'a1',
            teamName: 'Nhóm 1',
            teamNameNormalized: 'nhom 1',
            members: [{ memberId: 'm1', memberName: 'An', email: 'an@example.com' }],
            status: 'SUBMITTED',
            createdAt: '2026-03-01T00:00:00.000Z',
          },
          {
            teamId: 't2',
            assignmentId: 'a1',
            teamName: 'Nhóm 2',
            teamNameNormalized: 'nhom 2',
            members: [{ memberId: 'm2', memberName: 'Bình', email: 'binh@example.com' }],
            status: 'OPEN',
            createdAt: '2026-03-02T00:00:00.000Z',
          },
        ],
      });

      const event = makeEvent({
        pathParameters: { assignmentId: 'a1' },
      });

      const res = await handleListTeams(event);
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body!);
      expect(body).toHaveLength(2);
      expect(body[0].teamId).toBe('t1');
      expect(body[1].teamId).toBe('t2');
    });

    it('lọc danh sách nhóm theo status query param', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          {
            teamId: 't1',
            assignmentId: 'a1',
            teamName: 'Nhóm 1',
            teamNameNormalized: 'nhom 1',
            members: [],
            status: 'SUBMITTED',
            createdAt: '2026-03-01T00:00:00.000Z',
          },
          {
            teamId: 't2',
            assignmentId: 'a1',
            teamName: 'Nhóm 2',
            teamNameNormalized: 'nhom 2',
            members: [],
            status: 'OPEN',
            createdAt: '2026-03-02T00:00:00.000Z',
          },
        ],
      });

      const event = makeEvent({
        pathParameters: { assignmentId: 'a1' },
        queryStringParameters: { status: 'SUBMITTED' },
      });

      const res = await handleListTeams(event);
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body!);
      expect(body).toHaveLength(1);
      expect(body[0].teamId).toBe('t1');
      expect(body[0].status).toBe('SUBMITTED');
    });
  });

  describe('handleGetTeam', () => {
    it('lấy thông tin nhóm thành công', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          teamId: 't1',
          assignmentId: 'a1',
          teamName: 'Nhóm 1',
          teamNameNormalized: 'nhom 1',
          members: [{ memberId: 'm1', memberName: 'An', email: 'an@example.com' }],
          status: 'SUBMITTED',
          createdAt: '2026-03-01T00:00:00.000Z',
        },
      });

      const event = makeEvent({
        pathParameters: { teamId: 't1' },
      });

      const res = await handleGetTeam(event);
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body!);
      expect(body.teamId).toBe('t1');
      expect(body.teamName).toBe('Nhóm 1');
    });

    it('báo lỗi NotFoundError nếu nhóm không tồn tại', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({
        pathParameters: { teamId: 'not-exist' },
      });

      await expect(handleGetTeam(event)).rejects.toThrow(/Không tìm thấy/);
    });
  });

  describe('handleUnlockTeam', () => {
    it('mở khoá thành công nhóm đang SUBMITTED và lưu username từ JWT', async () => {
      // 1. Get team
      ddbMock.on(GetCommand).resolves({
        Item: {
          teamId: 't1',
          assignmentId: 'a1',
          teamName: 'Nhóm 1',
          teamNameNormalized: 'nhom 1',
          members: [],
          status: 'SUBMITTED',
          createdAt: '2026-03-01T00:00:00.000Z',
        },
      });

      // 2. Update team sang RESUBMISSION_ALLOWED
      ddbMock.on(UpdateCommand).resolves({
        Attributes: {
          teamId: 't1',
          assignmentId: 'a1',
          teamName: 'Nhóm 1',
          teamNameNormalized: 'nhom 1',
          members: [],
          status: 'RESUBMISSION_ALLOWED',
          createdAt: '2026-03-01T00:00:00.000Z',
          unlockedBy: 'teacher_thien',
          unlockedAt: '2026-03-12T19:00:00.000Z',
        },
      });

      const event = makeEvent({
        pathParameters: { teamId: 't1' },
      });

      const res = await handleUnlockTeam(event, 'teacher_thien');
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body!);
      expect(body.status).toBe('RESUBMISSION_ALLOWED');
      expect(body.unlockedBy).toBe('teacher_thien');

      const updateCalls = ddbMock.commandCalls(UpdateCommand);
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0].args[0].input.ExpressionAttributeValues?.[':by']).toBe('teacher_thien');
    });

    it('báo lỗi ValidationError nếu nhóm không ở trạng thái SUBMITTED', async () => {
      ddbMock.on(GetCommand).resolves({
        Item: {
          teamId: 't1',
          assignmentId: 'a1',
          teamName: 'Nhóm 1',
          status: 'OPEN',
          createdAt: '2026-03-01T00:00:00.000Z',
        },
      });

      const event = makeEvent({
        pathParameters: { teamId: 't1' },
      });

      await expect(handleUnlockTeam(event, 'teacher_thien')).rejects.toThrow(
        /Chỉ có thể mở khoá nộp lại cho nhóm đang ở trạng thái SUBMITTED/,
      );
    });

    it('báo lỗi NotFoundError nếu nhóm không tồn tại khi mở khoá', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({
        pathParameters: { teamId: 'non-existent' },
      });

      await expect(handleUnlockTeam(event, 'teacher_thien')).rejects.toThrow(/Không tìm thấy/);
    });
  });

  describe('handleGetTeamFiles', () => {
    it('trả về nội dung md, xml và presigned URLs', async () => {
      // 1. Get team record có latestSubmissionId
      ddbMock
        .on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'META' } })
        .resolves({
          Item: {
            teamId: 't1',
            assignmentId: 'a1',
            teamName: 'Nhóm 1',
            status: 'SUBMITTED',
            createdAt: '2026-03-01T00:00:00.000Z',
            latestSubmissionId: 's1',
          },
        });

      // 2. Get submission record
      ddbMock
        .on(GetCommand, { Key: { PK: 'TEAM#t1', SK: 'SUBMISSION#s1' } })
        .resolves({
          Item: {
            submissionId: 's1',
            teamId: 't1',
            assignmentId: 'a1',
            submittedAt: '2026-03-01T01:00:00.000Z',
            files: {
              md: { fileName: 'report.md', s3Key: 'submissions/t1/s1/report.md', etag: 'e1', size: 100 },
              xml: { fileName: 'data.xml', s3Key: 'submissions/t1/s1/data.xml', etag: 'e2', size: 200 },
            },
          },
        });

      // 3. S3 read text
      s3Mock
        .on(GetObjectCommand, { Key: 'submissions/t1/s1/report.md' })
        .resolves({
          Body: {
            transformToString: async () => '# Báo Cáo',
          } as never,
        });

      s3Mock
        .on(GetObjectCommand, { Key: 'submissions/t1/s1/data.xml' })
        .resolves({
          Body: {
            transformToString: async () => '<root><item/></root>',
          } as never,
        });

      const event = makeEvent({
        pathParameters: { teamId: 't1' },
      });

      const res = await handleGetTeamFiles(event);
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.body!);
      expect(body.md).toBe('# Báo Cáo');
      expect(body.xml).toBe('<root><item/></root>');
      expect(body.mdUrl).toContain('report.md');
      expect(body.xmlUrl).toContain('data.xml');
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

      const event = makeEvent({
        pathParameters: { teamId: 't1' },
      });

      await expect(handleGetTeamFiles(event)).rejects.toThrow(/Nhóm chưa nộp đủ 2 file/);
    });

    it('báo lỗi NotFoundError nếu nhóm không tồn tại', async () => {
      ddbMock.on(GetCommand).resolves({ Item: undefined });

      const event = makeEvent({
        pathParameters: { teamId: 'non-existent' },
      });

      await expect(handleGetTeamFiles(event)).rejects.toThrow(/Không tìm thấy/);
    });
  });
});
