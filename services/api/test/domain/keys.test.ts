import { describe, expect, it } from 'vitest';
import * as keys from '../../src/domain/keys.js';

describe('key builders', () => {
  const all = [
    keys.assignmentKey('a1'),
    keys.teamNameLockKey('a1', 'nhóm a'),
    keys.teamKey('t1'),
    keys.submissionKey('t1', 's1'),
    keys.uploadKey('s1'),
  ];

  it('đúng layout infra-plan 4.1', () => {
    expect(all).toEqual([
      { PK: 'ASSIGNMENT#a1', SK: 'META' },
      { PK: 'ASSIGNMENT#a1', SK: 'TEAMNAME#nhóm a' },
      { PK: 'TEAM#t1', SK: 'META' },
      { PK: 'TEAM#t1', SK: 'SUBMISSION#s1' },
      { PK: 'UPLOAD#s1', SK: 'META' },
    ]);
    expect(keys.teamsGsi1Pk('a1')).toBe('ASSIGNMENT#a1#TEAMS');
    expect(keys.ASSIGNMENTS_GSI1PK).toBe('ASSIGNMENTS');
  });

  it('S3 key theo submissions/{aid}/{teamId}/{sid}/report.md|data.xml', () => {
    expect(keys.submissionObjectKey('a1', 't1', 's1', 'md')).toBe('submissions/a1/t1/s1/report.md');
    expect(keys.submissionObjectKey('a1', 't1', 's1', 'xml')).toBe('submissions/a1/t1/s1/data.xml');
  });

  it('không builder nào tạo khoá GRADING (Property 6)', () => {
    for (const key of all) {
      expect(key.PK).not.toContain('GRADING');
      expect(key.SK).not.toContain('GRADING');
    }
    expect(Object.keys(keys).some((name) => /grading/i.test(name))).toBe(false);
  });

  it('Content-Type cố định', () => {
    expect(keys.SUBMISSION_CONTENT_TYPES).toEqual({
      md: 'text/markdown; charset=utf-8',
      xml: 'application/xml',
    });
  });
});
