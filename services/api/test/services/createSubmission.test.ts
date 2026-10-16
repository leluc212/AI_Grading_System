import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  AssignmentClosedError,
  NotFoundError,
  TeamNameConflictError,
} from '@quick-grading/shared-types';
import { createSubmission } from '../../src/services/submissionService.js';
import {
  ASSIGNMENT_ID,
  TEAM_ID,
  assignmentItem,
  lockItem,
  setTestEnv,
  teamItem,
  validRequest,
} from '../helpers.js';

const ddbMock = mockClient(DynamoDBDocumentClient);
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

beforeAll(() => {
  setTestEnv();
});

beforeEach(() => {
  ddbMock.reset();
  ddbMock.on(GetCommand).resolves({});
  ddbMock.on(PutCommand).resolves({});
});

function givenAssignment(status: 'OPEN' | 'CLOSED' = 'OPEN') {
  ddbMock
    .on(GetCommand, { Key: { PK: `ASSIGNMENT#${ASSIGNMENT_ID}`, SK: 'META' } })
    .resolves({ Item: assignmentItem(status) });
}

function givenTeam(status: 'OPEN' | 'SUBMITTED' | 'RESUBMISSION_ALLOWED') {
  ddbMock
    .on(GetCommand, { Key: { PK: `ASSIGNMENT#${ASSIGNMENT_ID}`, SK: 'TEAMNAME#nhóm a' } })
    .resolves({ Item: lockItem() });
  ddbMock
    .on(GetCommand, { Key: { PK: `TEAM#${TEAM_ID}`, SK: 'META' } })
    .resolves({ Item: teamItem(status) });
}

function sessionPut() {
  const calls = ddbMock.commandCalls(PutCommand);
  expect(calls).toHaveLength(1);
  return calls[0].args[0].input;
}

describe('createSubmission', () => {
  it('nhóm mới: phiên existingTeam=false, teamId ULID mới, 2 presigned POST', async () => {
    givenAssignment();
    const res = await createSubmission(validRequest());

    expect(res.submissionId).toMatch(ULID);
    expect(Object.keys(res.uploads).sort()).toEqual(['md', 'xml']);
    expect(res.uploads.md.fields.key).toMatch(
      new RegExp(`^submissions/${ASSIGNMENT_ID}/[0-9A-Z]{26}/${res.submissionId}/report.md$`),
    );
    expect(res.uploads.xml.fields.key).toMatch(/\/data\.xml$/);
    expect(Date.parse(res.expiresAt)).toBeGreaterThan(Date.now() + 590_000);

    const put = sessionPut();
    expect(put.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(put.Item).toMatchObject({
      PK: `UPLOAD#${res.submissionId}`,
      SK: 'META',
      state: 'PENDING',
      existingTeam: false,
      teamName: 'Nhóm A',
      teamNameNormalized: 'nhóm a',
    });
    expect(put.Item?.teamId).toMatch(ULID);
    expect(put.Item?.teamId).not.toBe(TEAM_ID);
    expect(put.Item?.ttl).toBeGreaterThan(Math.floor(Date.now() / 1000) + 3500);
  });

  it.each(['OPEN', 'RESUBMISSION_ALLOWED'] as const)(
    'nhóm %s: dùng lại teamId cũ, existingTeam=true',
    async (status) => {
      givenAssignment();
      givenTeam(status);
      const res = await createSubmission(validRequest());
      const put = sessionPut();
      expect(put.Item).toMatchObject({ teamId: TEAM_ID, existingTeam: true });
      expect(res.uploads.md.fields.key).toContain(`/${TEAM_ID}/`);
    },
  );

  it('nhóm SUBMITTED -> TeamNameConflictError, không tạo phiên', async () => {
    givenAssignment();
    givenTeam('SUBMITTED');
    await expect(createSubmission(validRequest())).rejects.toBeInstanceOf(TeamNameConflictError);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  it('đợt CLOSED -> AssignmentClosedError', async () => {
    givenAssignment('CLOSED');
    await expect(createSubmission(validRequest())).rejects.toBeInstanceOf(AssignmentClosedError);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  it('đợt không tồn tại -> NotFoundError', async () => {
    await expect(createSubmission(validRequest())).rejects.toBeInstanceOf(NotFoundError);
    expect(ddbMock.commandCalls(PutCommand)).toHaveLength(0);
  });

  it('tên nhóm dạng NFD vẫn tra đúng khoá NFC', async () => {
    givenAssignment();
    givenTeam('SUBMITTED');
    const req = { ...validRequest(), teamName: 'NHO\u0301M A' };
    await expect(createSubmission(req)).rejects.toBeInstanceOf(TeamNameConflictError);
  });
});
