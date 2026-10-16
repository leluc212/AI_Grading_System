import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '../../src/index.js';
import {
  ASSIGNMENT_ID,
  SUBMISSION_ID,
  TEAM_ID,
  assignmentItem,
  body,
  lockItem,
  sessionItem,
  setTestEnv,
  teamItem,
  validRequest,
} from '../helpers.js';

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

function event(
  routeKey: string,
  extra: Partial<APIGatewayProxyEventV2> = {},
): APIGatewayProxyEventV2 {
  const [, rawPath] = routeKey.split(' ');
  return {
    version: '2.0',
    routeKey,
    rawPath,
    rawQueryString: '',
    headers: {},
    isBase64Encoded: false,
    requestContext: { requestId: 'req-1' } as APIGatewayProxyEventV2['requestContext'],
    ...extra,
  } as APIGatewayProxyEventV2;
}

function parse(res: APIGatewayProxyStructuredResultV2) {
  return JSON.parse(res.body ?? 'null');
}

function expectSecurityHeaders(res: APIGatewayProxyStructuredResultV2) {
  expect(res.headers).toMatchObject({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
}

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  setTestEnv();
});

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(PutCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});
  s3Mock.on(PutObjectTaggingCommand).resolves({});
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function allLogs(): string {
  return [...logSpy.mock.calls, ...errorSpy.mock.calls].map((c) => String(c[0])).join('\n');
}

describe('GET /api/assignments', () => {
  it('200 AssignmentListItem[] theo createdAt tăng dần', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [assignmentItem('OPEN'), { ...assignmentItem('CLOSED'), assignmentId: 'a2' }],
    });
    const res = await handler(event('GET /api/assignments'));
    expect(res.statusCode).toBe(200);
    expectSecurityHeaders(res);
    const list = parse(res);
    expect(list).toHaveLength(2);
    expect(list[0]).toEqual({
      assignmentId: ASSIGNMENT_ID,
      assignmentName: 'Đợt 1 - Lập trình Web - K21',
      status: 'OPEN',
      createdAt: '2024-09-01T08:00:00.000Z',
      createdBy: 'admin',
      submittedTeamCount: 3,
    });
    const query = ddbMock.commandCalls(QueryCommand)[0].args[0].input;
    expect(query).toMatchObject({ IndexName: 'GSI1', ScanIndexForward: true });
  });
});

describe('GET /api/assignments/{assignmentId}', () => {
  it('200 Assignment (không có submittedTeamCount/PK)', async () => {
    ddbMock.on(GetCommand).resolves({ Item: assignmentItem('OPEN') });
    const res = await handler(
      event('GET /api/assignments/{assignmentId}', {
        pathParameters: { assignmentId: ASSIGNMENT_ID },
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(parse(res)).toEqual({
      assignmentId: ASSIGNMENT_ID,
      assignmentName: 'Đợt 1 - Lập trình Web - K21',
      status: 'OPEN',
      createdAt: '2024-09-01T08:00:00.000Z',
      createdBy: 'admin',
    });
  });

  it('404 khi không tồn tại, 400 khi id sai định dạng', async () => {
    const notFound = await handler(
      event('GET /api/assignments/{assignmentId}', { pathParameters: { assignmentId: 'zzz' } }),
    );
    expect(notFound.statusCode).toBe(404);
    expect(parse(notFound).code).toBe('NOT_FOUND');
    const bad = await handler(
      event('GET /api/assignments/{assignmentId}', { pathParameters: { assignmentId: 'a/b' } }),
    );
    expect(bad.statusCode).toBe(400);
  });
});

describe('GET /api/teams/check-name', () => {
  it('available=false khi nhóm SUBMITTED, true khi chưa có', async () => {
    ddbMock
      .on(GetCommand, { Key: { PK: `ASSIGNMENT#${ASSIGNMENT_ID}`, SK: 'TEAMNAME#nhóm a' } })
      .resolves({ Item: lockItem() });
    ddbMock
      .on(GetCommand, { Key: { PK: `TEAM#${TEAM_ID}`, SK: 'META' } })
      .resolves({ Item: teamItem('SUBMITTED') });
    const taken = await handler(
      event('GET /api/teams/check-name', {
        queryStringParameters: { assignmentId: ASSIGNMENT_ID, teamName: ' NHÓM A ' },
      }),
    );
    expect(taken.statusCode).toBe(200);
    expect(parse(taken)).toEqual({ available: false });

    const free = await handler(
      event('GET /api/teams/check-name', {
        queryStringParameters: { assignmentId: ASSIGNMENT_ID, teamName: 'Nhóm B' },
      }),
    );
    expect(parse(free)).toEqual({ available: true });
  });

  it('thiếu tham số -> 400', async () => {
    const res = await handler(
      event('GET /api/teams/check-name', { queryStringParameters: { assignmentId: 'a1' } }),
    );
    expect(res.statusCode).toBe(400);
    expect(parse(res).code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /api/submissions', () => {
  it('201 CreateSubmissionResponse, log không chứa email/tên nhóm', async () => {
    ddbMock.on(GetCommand).resolves({});
    ddbMock
      .on(GetCommand, { Key: { PK: `ASSIGNMENT#${ASSIGNMENT_ID}`, SK: 'META' } })
      .resolves({ Item: assignmentItem('OPEN') });
    const res = await handler(
      event('POST /api/submissions', { body: JSON.stringify(validRequest()) }),
    );
    expect(res.statusCode).toBe(201);
    expectSecurityHeaders(res);
    const json = parse(res);
    expect(json.submissionId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(json.uploads.md.url).toContain('quick-grading-test-000000000000');
    expect(json.uploads.md.fields.key).toMatch(/report\.md$/);
    expect(json.uploads.xml.fields.key).toMatch(/data\.xml$/);
    expect(typeof json.expiresAt).toBe('string');

    const logs = allLogs();
    expect(logs).toContain(json.submissionId);
    expect(logs).not.toContain('a@example.com');
    expect(logs).not.toContain('Nhóm A');
    expect(logs).not.toContain('Nguyễn Văn A');
    expect(logs).not.toContain('X-Amz-Signature');
  });

  it('JSON sai -> 400 VALIDATION_ERROR', async () => {
    const res = await handler(event('POST /api/submissions', { body: '{oops' }));
    expect(res.statusCode).toBe(400);
    expect(parse(res).code).toBe('VALIDATION_ERROR');
    expectSecurityHeaders(res);
  });

  it('DomainError giữ status (CLOSED -> 409)', async () => {
    ddbMock.on(GetCommand).resolves({ Item: assignmentItem('CLOSED') });
    const res = await handler(
      event('POST /api/submissions', { body: JSON.stringify(validRequest()) }),
    );
    expect(res.statusCode).toBe(409);
    expect(parse(res).code).toBe('ASSIGNMENT_CLOSED');
  });

  it('lỗi SDK bất ngờ -> 500 INTERNAL_ERROR, không lộ message gốc', async () => {
    ddbMock.on(GetCommand).rejects(new Error('secret internal detail arn:aws:dynamodb:xyz'));
    const res = await handler(
      event('POST /api/submissions', { body: JSON.stringify(validRequest()) }),
    );
    expect(res.statusCode).toBe(500);
    const json = parse(res);
    expect(json.code).toBe('INTERNAL_ERROR');
    expect(res.body).not.toContain('secret internal detail');
    expect(res.body).not.toContain('arn:aws');
    expect(allLogs()).not.toContain('secret internal detail');
    expectSecurityHeaders(res);
  });
});

describe('POST /api/submissions/{submissionId}/finalize', () => {
  it('201 { team, files (2, isLatest, etag), resubmitted:false }', async () => {
    ddbMock
      .on(GetCommand, { Key: { PK: `UPLOAD#${SUBMISSION_ID}`, SK: 'META' } })
      .resolves({ Item: sessionItem() });
    const prefix = `submissions/${ASSIGNMENT_ID}/${TEAM_ID}/${SUBMISSION_ID}`;
    s3Mock.on(HeadObjectCommand, { Key: `${prefix}/report.md` }).resolves({
      ContentLength: 10,
      ETag: '"e1"',
      ContentType: 'text/markdown; charset=utf-8',
    });
    s3Mock.on(HeadObjectCommand, { Key: `${prefix}/data.xml` }).resolves({
      ContentLength: 10,
      ETag: '"e2"',
      ContentType: 'application/xml',
    });
    s3Mock.on(GetObjectCommand, { Key: `${prefix}/report.md` }).resolves({ Body: body('# a') });
    s3Mock.on(GetObjectCommand, { Key: `${prefix}/data.xml` }).resolves({ Body: body('<a/>') });

    const res = await handler(
      event('POST /api/submissions/{submissionId}/finalize', {
        pathParameters: { submissionId: SUBMISSION_ID },
      }),
    );
    expect(res.statusCode).toBe(201);
    const json = parse(res);
    expect(Object.keys(json).sort()).toEqual(['files', 'resubmitted', 'team']);
    expect(json.resubmitted).toBe(false);
    expect(json.team.status).toBe('SUBMITTED');
    expect(json.files).toHaveLength(2);
    for (const f of json.files) {
      expect(f).toMatchObject({ teamId: TEAM_ID, isLatest: true });
      expect(typeof f.etag).toBe('string');
    }
    expect(allLogs()).not.toContain('a@example.com');
  });

  it('submissionId sai định dạng -> 400; phiên không có -> 404', async () => {
    const bad = await handler(
      event('POST /api/submissions/{submissionId}/finalize', {
        pathParameters: { submissionId: 'nope' },
      }),
    );
    expect(bad.statusCode).toBe(400);
    const missing = await handler(
      event('POST /api/submissions/{submissionId}/finalize', {
        pathParameters: { submissionId: SUBMISSION_ID },
      }),
    );
    expect(missing.statusCode).toBe(404);
    expect(parse(missing).code).toBe('NOT_FOUND');
  });
});

describe('route lạ', () => {
  it('404 NOT_FOUND', async () => {
    const res = await handler(event('GET /api/teams/{teamId}/grading/history'));
    expect(res.statusCode).toBe(404);
    expect(parse(res).code).toBe('NOT_FOUND');
    expectSecurityHeaders(res);
  });
});
