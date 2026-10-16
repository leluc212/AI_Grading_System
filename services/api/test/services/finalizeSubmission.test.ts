import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AssignmentClosedError,
  NotFoundError,
  TeamNameConflictError,
  ValidationError,
} from '@quick-grading/shared-types';
import { finalizeSubmission } from '../../src/services/submissionService.js';
import {
  ASSIGNMENT_ID,
  SUBMISSION_ID,
  TEAM_ID,
  body,
  lockItem,
  sessionItem,
  setTestEnv,
  teamItem,
} from '../helpers.js';

const ddbMock = mockClient(DynamoDBDocumentClient);
const s3Mock = mockClient(S3Client);

const PREFIX = `submissions/${ASSIGNMENT_ID}/${TEAM_ID}/${SUBMISSION_ID}`;
const MD_KEY = `${PREFIX}/report.md`;
const XML_KEY = `${PREFIX}/data.xml`;

beforeAll(() => {
  setTestEnv();
});

function givenSession(overrides: Parameters<typeof sessionItem>[0] = {}) {
  ddbMock
    .on(GetCommand, { Key: { PK: `UPLOAD#${SUBMISSION_ID}`, SK: 'META' } })
    .resolves({ Item: sessionItem(overrides) });
}

function givenTeam(status: 'OPEN' | 'SUBMITTED' | 'RESUBMISSION_ALLOWED', lockTeamId = TEAM_ID) {
  ddbMock
    .on(GetCommand, { Key: { PK: `ASSIGNMENT#${ASSIGNMENT_ID}`, SK: 'TEAMNAME#nhóm a' } })
    .resolves({ Item: lockItem(lockTeamId) });
  ddbMock
    .on(GetCommand, { Key: { PK: `TEAM#${lockTeamId}`, SK: 'META' } })
    .resolves({ Item: { ...teamItem(status), teamId: lockTeamId } });
}

function givenObjects(
  opts: { mdSize?: number; xmlBody?: string; mdBody?: string | Uint8Array } = {},
) {
  s3Mock.on(HeadObjectCommand, { Key: MD_KEY }).resolves({
    ContentLength: opts.mdSize ?? 100,
    ETag: '"md-etag"',
    ContentType: 'text/markdown; charset=utf-8',
  });
  s3Mock.on(HeadObjectCommand, { Key: XML_KEY }).resolves({
    ContentLength: 200,
    ETag: '"xml-etag"',
    ContentType: 'application/xml',
  });
  s3Mock.on(GetObjectCommand, { Key: MD_KEY }).resolves({ Body: body(opts.mdBody ?? '# Bài') });
  s3Mock.on(GetObjectCommand, { Key: XML_KEY }).resolves({ Body: body(opts.xmlBody ?? '<root/>') });
}

function transactItems() {
  const calls = ddbMock.commandCalls(TransactWriteCommand);
  expect(calls).toHaveLength(1);
  return calls[0].args[0].input.TransactItems ?? [];
}

function cancelledAt(index: number) {
  const reasons = Array.from({ length: 5 }, (_, i) => ({
    Code: i === index ? 'ConditionalCheckFailed' : 'None',
  }));
  return new TransactionCanceledException({
    message: 'Transaction cancelled',
    $metadata: {},
    CancellationReasons: reasons,
  });
}

function s3Error(name: string, status: number) {
  return new S3ServiceException({
    name,
    $fault: 'client',
    $metadata: { httpStatusCode: status },
    message: name,
  });
}

beforeEach(() => {
  ddbMock.reset();
  s3Mock.reset();
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(TransactWriteCommand).resolves({});
  s3Mock.on(PutObjectTaggingCommand).resolves({});
});

describe('finalizeSubmission - thành công', () => {
  it('nhóm mới -> 201, khoá tên attribute_not_exists, ADD submittedTeamCount', async () => {
    givenSession();
    givenObjects();
    const res = await finalizeSubmission(SUBMISSION_ID);

    expect(res.status).toBe(201);
    expect(res.resubmitted).toBe(false);
    expect(res.team).toMatchObject({
      teamId: TEAM_ID,
      assignmentId: ASSIGNMENT_ID,
      teamName: 'Nhóm A',
      teamNameNormalized: 'nhóm a',
      status: 'SUBMITTED',
    });
    expect(res.team.members[0]).toMatchObject({ memberName: 'Nguyễn Văn A', studentCode: 'SV001' });
    expect(res.team.members[0].memberId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.files).toEqual([
      expect.objectContaining({ fileType: 'md', s3Key: MD_KEY, etag: 'md-etag', isLatest: true }),
      expect.objectContaining({
        fileType: 'xml',
        s3Key: XML_KEY,
        etag: 'xml-etag',
        isLatest: true,
      }),
    ]);

    const items = transactItems();
    expect(items).toHaveLength(5);
    expect(items[0].Put?.Item).toMatchObject({
      PK: `ASSIGNMENT#${ASSIGNMENT_ID}`,
      SK: 'TEAMNAME#nhóm a',
      teamId: TEAM_ID,
    });
    expect(items[0].Put?.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(items[1].Put?.Item).toMatchObject({
      PK: `TEAM#${TEAM_ID}`,
      SK: 'META',
      GSI1PK: `ASSIGNMENT#${ASSIGNMENT_ID}#TEAMS`,
      status: 'SUBMITTED',
      latestSubmissionId: SUBMISSION_ID,
    });
    expect(items[1].Put?.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(items[2].Put?.Item).toMatchObject({
      PK: `TEAM#${TEAM_ID}`,
      SK: `SUBMISSION#${SUBMISSION_ID}`,
      files: {
        md: { fileName: 'bai-lam.md', s3Key: MD_KEY, etag: 'md-etag', size: 100 },
        xml: { fileName: 'bai-lam.xml', s3Key: XML_KEY, etag: 'xml-etag', size: 200 },
      },
    });
    expect(items[3].Update?.UpdateExpression).toBe('ADD submittedTeamCount :one');
    expect(items[3].Update?.ConditionExpression).toBe('#status = :open');
    expect(items[4].Update?.Key).toEqual({ PK: `UPLOAD#${SUBMISSION_ID}`, SK: 'META' });
    expect(items[4].Update?.ConditionExpression).toBe('#state = :pending');
  });

  it('RESUBMISSION_ALLOWED -> 200, resubmitted, cùng teamId, cập nhật members, KHÔNG tăng đếm', async () => {
    givenSession({ existingTeam: true });
    givenTeam('RESUBMISSION_ALLOWED');
    givenObjects();
    const res = await finalizeSubmission(SUBMISSION_ID);

    expect(res.status).toBe(200);
    expect(res.resubmitted).toBe(true);
    expect(res.team.teamId).toBe(TEAM_ID);
    expect(res.team.status).toBe('SUBMITTED');
    expect(res.team.members.map((m) => m.memberName)).toEqual(['Nguyễn Văn A']);
    expect(res.team).not.toHaveProperty('activeGradingAttemptId');
    expect(res.team).not.toHaveProperty('PK');

    const items = transactItems();
    expect(items[0].ConditionCheck?.ConditionExpression).toBe('teamId = :teamId');
    expect(items[1].Update?.ConditionExpression).toBe('#status = :observed');
    expect(items[1].Update?.ExpressionAttributeValues?.[':observed']).toBe('RESUBMISSION_ALLOWED');
    expect(items[1].Update?.ExpressionAttributeValues?.[':members']).toHaveLength(1);
    expect(items[3].Update).toBeUndefined();
    expect(items[3].ConditionCheck?.ConditionExpression).toBe('#status = :open');
    expect(JSON.stringify(items)).not.toContain('submittedTeamCount');
  });

  it('nhóm OPEN chưa từng nộp -> 200 và tăng đếm', async () => {
    givenSession({ existingTeam: true });
    givenTeam('OPEN');
    givenObjects();
    const res = await finalizeSubmission(SUBMISSION_ID);
    expect(res.status).toBe(200);
    const items = transactItems();
    expect(items[3].Update?.UpdateExpression).toBe('ADD submittedTeamCount :one');
  });
});

describe('finalizeSubmission - thứ tự tag trước TransactWrite', () => {
  it('cả 2 PutObjectTagging(state=final) chạy trước TransactWrite', async () => {
    givenSession();
    givenObjects();
    const sequence: string[] = [];
    s3Mock.on(PutObjectTaggingCommand).callsFake((input) => {
      expect(input.Tagging.TagSet).toEqual([{ Key: 'state', Value: 'final' }]);
      sequence.push(`tag:${input.Key}`);
      return {};
    });
    ddbMock.on(TransactWriteCommand).callsFake(() => {
      sequence.push('transact');
      return {};
    });
    await finalizeSubmission(SUBMISSION_ID);
    expect(sequence).toEqual([`tag:${MD_KEY}`, `tag:${XML_KEY}`, 'transact']);
  });

  it('PutObjectTagging lỗi -> không bao giờ gọi TransactWrite', async () => {
    givenSession();
    givenObjects();
    s3Mock.on(PutObjectTaggingCommand).rejects(s3Error('InternalError', 500));
    await expect(finalizeSubmission(SUBMISSION_ID)).rejects.toThrow();
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });
});

describe('finalizeSubmission - transaction bị huỷ', () => {
  it.each([
    [0, TeamNameConflictError],
    [1, TeamNameConflictError],
    [3, AssignmentClosedError],
    [4, NotFoundError],
  ] as const)('lý do ở vị trí %i -> %o', async (index, errorClass) => {
    givenSession();
    givenObjects();
    ddbMock.on(TransactWriteCommand).rejects(cancelledAt(index));
    await expect(finalizeSubmission(SUBMISSION_ID)).rejects.toBeInstanceOf(errorClass);
  });

  it('lý do ở vị trí 2 -> lỗi gốc (500)', async () => {
    givenSession();
    givenObjects();
    ddbMock.on(TransactWriteCommand).rejects(cancelledAt(2));
    await expect(finalizeSubmission(SUBMISSION_ID)).rejects.toBeInstanceOf(
      TransactionCanceledException,
    );
  });
});

describe('finalizeSubmission - file không hợp lệ -> 400', () => {
  it.each([
    ['NotFound', 404],
    ['Forbidden', 403],
  ])('thiếu object (%s)', async (name, status) => {
    givenSession();
    givenObjects();
    s3Mock.on(HeadObjectCommand, { Key: XML_KEY }).rejects(s3Error(name, status));
    await expect(finalizeSubmission(SUBMISSION_ID)).rejects.toBeInstanceOf(ValidationError);
    expect(s3Mock.commandCalls(PutObjectTaggingCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('size > 5MB', async () => {
    givenSession();
    givenObjects({ mdSize: 5_242_881 });
    await expect(finalizeSubmission(SUBMISSION_ID)).rejects.toBeInstanceOf(ValidationError);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('Content-Type sai', async () => {
    givenSession();
    givenObjects();
    s3Mock.on(HeadObjectCommand, { Key: MD_KEY }).resolves({
      ContentLength: 100,
      ETag: '"x"',
      ContentType: 'text/html',
    });
    await expect(finalizeSubmission(SUBMISSION_ID)).rejects.toBeInstanceOf(ValidationError);
  });

  it('xml không bắt đầu bằng "<"', async () => {
    givenSession();
    givenObjects({ xmlBody: 'hello' });
    await expect(finalizeSubmission(SUBMISSION_ID)).rejects.toBeInstanceOf(ValidationError);
    expect(s3Mock.commandCalls(PutObjectTaggingCommand)).toHaveLength(0);
  });

  it('md chứa NUL', async () => {
    givenSession();
    givenObjects({ mdBody: new Uint8Array([0x23, 0x00]) });
    await expect(finalizeSubmission(SUBMISSION_ID)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('finalizeSubmission - phiên / nhóm', () => {
  it('phiên không tồn tại -> NotFoundError', async () => {
    await expect(finalizeSubmission(SUBMISSION_ID)).rejects.toBeInstanceOf(NotFoundError);
    expect(s3Mock.calls()).toHaveLength(0);
  });

  it('phiên hết hạn (ttl <= now) -> NotFoundError', async () => {
    givenSession({ ttl: Math.floor(Date.now() / 1000) - 1 });
    await expect(finalizeSubmission(SUBMISSION_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('phiên DONE -> NotFoundError', async () => {
    givenSession({ state: 'DONE' });
    await expect(finalizeSubmission(SUBMISSION_ID)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('nhóm đã SUBMITTED lúc finalize -> 409, không tag, không TransactWrite', async () => {
    givenSession({ existingTeam: true });
    givenTeam('SUBMITTED');
    givenObjects();
    await expect(finalizeSubmission(SUBMISSION_ID)).rejects.toBeInstanceOf(TeamNameConflictError);
    expect(s3Mock.commandCalls(PutObjectTaggingCommand)).toHaveLength(0);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('nhóm khác cùng tên được tạo sau khi mở phiên -> 409', async () => {
    givenSession();
    givenTeam('OPEN', '01JA00000000000000000000ZZ');
    givenObjects();
    await expect(finalizeSubmission(SUBMISSION_ID)).rejects.toBeInstanceOf(TeamNameConflictError);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });
});
