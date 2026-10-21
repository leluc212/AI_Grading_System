/**
 * Idempotency key builder cho lượt chấm (infra-plan mục 6.5).
 *
 * idempotencyKey = sha256(teamId|submissionId|rubricVersion|gradingConfigVersion|model)
 */
import { createHash } from 'node:crypto';

export interface BuildIdempotencyKeyParams {
  teamId: string;
  submissionId: string;
  rubricVersion?: number;
  gradingConfigVersion: number;
  model: string;
}

export function buildIdempotencyKey({
  teamId,
  submissionId,
  rubricVersion = 0,
  gradingConfigVersion,
  model,
}: BuildIdempotencyKeyParams): string {
  const parts = [teamId, submissionId, rubricVersion, gradingConfigVersion, model];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}
