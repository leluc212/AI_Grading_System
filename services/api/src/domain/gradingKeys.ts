/**
 * Builder khoá DynamoDB cho chức năng chấm bài (grading-worker, admin-api).
 *
 * Tách riêng khỏi `domain/keys.ts` để bảo toàn Property 6: `public-api`
 * không bao giờ dựng hay truy xuất khoá `GRADING#`.
 */
import type { ItemKey } from './keys.js';

export function gradingAttemptKey(teamId: string, gradingAttemptId: string): ItemKey {
  return {
    PK: `TEAM#${teamId}`,
    SK: `GRADING#${gradingAttemptId}`,
  };
}

export function rubricActiveKey(): ItemKey {
  return {
    PK: 'RUBRIC#default',
    SK: 'ACTIVE',
  };
}

export function rubricVersionKey(version: number): ItemKey {
  return {
    PK: 'RUBRIC#default',
    SK: `V#${version}`,
  };
}

export function gradingConfigActiveKey(): ItemKey {
  return {
    PK: 'GRADINGCONFIG#default',
    SK: 'ACTIVE',
  };
}

export function gradingConfigVersionKey(version: number): ItemKey {
  return {
    PK: 'GRADINGCONFIG#default',
    SK: `V#${version}`,
  };
}
