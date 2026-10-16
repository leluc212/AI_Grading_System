import { describe, expect, it } from 'vitest';
import { ValidationError } from '@quick-grading/shared-types';
import {
  parseAssignmentId,
  parseCheckNameQuery,
  parseCreateSubmissionRequest,
  parseSubmissionId,
} from '../../src/domain/validation.js';
import { validRequest } from '../helpers.js';

function withBody(mutate: (body: Record<string, unknown>) => void): unknown {
  const body = JSON.parse(JSON.stringify(validRequest())) as Record<string, unknown>;
  mutate(body);
  return body;
}

function member(body: Record<string, unknown>): Record<string, unknown> {
  return (body.members as Record<string, unknown>[])[0];
}

function file(body: Record<string, unknown>, type: 'md' | 'xml'): Record<string, unknown> {
  return (body.files as Record<string, Record<string, unknown>>)[type];
}

function expectInvalid(body: unknown) {
  expect(() => parseCreateSubmissionRequest(body)).toThrow(ValidationError);
}

describe('parseCreateSubmissionRequest', () => {
  it('happy path', () => {
    expect(parseCreateSubmissionRequest(validRequest())).toEqual(validRequest());
  });

  it('chuẩn hoá NFC + trim tên nhóm, trim email, MSSV rỗng -> undefined', () => {
    const result = parseCreateSubmissionRequest(
      withBody((b) => {
        b.teamName = '  Nho\u0301m A ';
        member(b).email = ' a@example.com ';
        member(b).studentCode = '   ';
      }),
    );
    expect(result.teamName).toBe('Nhóm A');
    expect(result.members[0]).toEqual({ memberName: 'Nguyễn Văn A', email: 'a@example.com' });
  });

  it('body không phải object', () => {
    expectInvalid(null);
    expectInvalid('x');
    expectInvalid([validRequest()]);
  });

  it('teamName rỗng / quá 100 ký tự / sai kiểu', () => {
    expectInvalid(withBody((b) => (b.teamName = '   ')));
    expectInvalid(withBody((b) => (b.teamName = 'a'.repeat(101))));
    expectInvalid(withBody((b) => (b.teamName = 5)));
    expect(
      parseCreateSubmissionRequest(withBody((b) => (b.teamName = 'a'.repeat(100)))).teamName,
    ).toHaveLength(100);
  });

  it('assignmentId sai định dạng', () => {
    expectInvalid(withBody((b) => (b.assignmentId = '../etc')));
    expectInvalid(withBody((b) => (b.assignmentId = 'a'.repeat(65))));
  });

  it('members 0 / 21 / không phải mảng', () => {
    expectInvalid(withBody((b) => (b.members = [])));
    expectInvalid(withBody((b) => (b.members = Array.from({ length: 21 }, () => member(b)))));
    expectInvalid(withBody((b) => (b.members = 'x')));
    expect(
      parseCreateSubmissionRequest(
        withBody((b) => (b.members = Array.from({ length: 20 }, () => member(b)))),
      ).members,
    ).toHaveLength(20);
  });

  it('memberName rỗng / 101 ký tự', () => {
    expectInvalid(withBody((b) => (member(b).memberName = ' ')));
    expectInvalid(withBody((b) => (member(b).memberName = 'a'.repeat(101))));
  });

  it('email sai / 255 ký tự', () => {
    expectInvalid(withBody((b) => (member(b).email = 'not-an-email')));
    expectInvalid(withBody((b) => (member(b).email = `${'a'.repeat(243)}@example.com`)));
  });

  it('studentCode 31 ký tự / kiểu số', () => {
    expectInvalid(withBody((b) => (member(b).studentCode = 'S'.repeat(31))));
    expectInvalid(withBody((b) => (member(b).studentCode = 123)));
  });

  it('fileName sai đuôi theo từng slot, chứa / hoặc \\, dài 256', () => {
    expectInvalid(withBody((b) => (file(b, 'md').fileName = 'bai-lam.xml')));
    expectInvalid(withBody((b) => (file(b, 'xml').fileName = 'bai-lam.md')));
    expectInvalid(withBody((b) => (file(b, 'md').fileName = 'x.exe')));
    expectInvalid(withBody((b) => (file(b, 'md').fileName = '../a.md')));
    expectInvalid(withBody((b) => (file(b, 'md').fileName = 'a\\b.md')));
    expectInvalid(withBody((b) => (file(b, 'md').fileName = `${'a'.repeat(253)}.md`)));
    expect(
      parseCreateSubmissionRequest(withBody((b) => (file(b, 'md').fileName = 'BAI.MD'))).files.md
        .fileName,
    ).toBe('BAI.MD');
  });

  it('size 0 / 5_242_881 / 1.5 / chuỗi', () => {
    expectInvalid(withBody((b) => (file(b, 'md').size = 0)));
    expectInvalid(withBody((b) => (file(b, 'xml').size = 5_242_881)));
    expectInvalid(withBody((b) => (file(b, 'md').size = 1.5)));
    expectInvalid(withBody((b) => (file(b, 'md').size = '100')));
    expect(
      parseCreateSubmissionRequest(withBody((b) => (file(b, 'xml').size = 5_242_880))).files.xml
        .size,
    ).toBe(5_242_880);
  });

  it('thiếu files', () => {
    expectInvalid(withBody((b) => delete b.files));
    expectInvalid(withBody((b) => delete (b.files as Record<string, unknown>).xml));
  });

  it('từ chối field lạ ở mọi cấp (không tin flag/id client gửi)', () => {
    expectInvalid(withBody((b) => (b.teamId = 'x')));
    expectInvalid(withBody((b) => (b.status = 'SUBMITTED')));
    expectInvalid(withBody((b) => (member(b).memberId = 'x')));
    expectInvalid(withBody((b) => (file(b, 'md').s3Key = 'other/key')));
    expectInvalid(withBody((b) => ((b.files as Record<string, unknown>).extra = {})));
  });
});

describe('parse id / query', () => {
  it('assignmentId', () => {
    expect(parseAssignmentId('a1111111-1111-4111-8111-111111111111')).toBe(
      'a1111111-1111-4111-8111-111111111111',
    );
    expect(() => parseAssignmentId(undefined)).toThrow(ValidationError);
    expect(() => parseAssignmentId('a b')).toThrow(ValidationError);
  });

  it('submissionId là ULID', () => {
    expect(parseSubmissionId('01JA0000000000000000000002')).toBe('01JA0000000000000000000002');
    expect(() => parseSubmissionId('01JA000000000000000000000I')).toThrow(ValidationError);
    expect(() => parseSubmissionId('short')).toThrow(ValidationError);
  });

  it('check-name query', () => {
    expect(parseCheckNameQuery({ assignmentId: 'a1', teamName: ' Nho\u0301m A ' })).toEqual({
      assignmentId: 'a1',
      teamName: 'Nhóm A',
    });
    expect(() => parseCheckNameQuery(undefined)).toThrow(ValidationError);
    expect(() => parseCheckNameQuery({ assignmentId: 'a1' })).toThrow(ValidationError);
  });
});
