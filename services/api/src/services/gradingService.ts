/**
 * Service xử lý kích hoạt chấm bài (trigger grading) (infra-plan mục 2.4, 6.5).
 */
import { ulid } from 'ulid';
import { NotFoundError, ValidationError } from '@quick-grading/shared-types';
import { getTeamRecord } from '../repositories/teamsRepo.js';
import { getActiveRubric, getActiveGradingConfig } from '../repositories/configRepo.js';
import {
  lockTeamAndCreateAttempt,
  unlockTeamAndFailAttempt,
  getLatestGradedAttempt,
} from '../repositories/gradingRepo.js';
import { getOpenAiModel } from '../config/ssm.js';
import { buildIdempotencyKey } from '../grading/idempotency.js';
import { sendGradingMessage } from '../storage/sqs.js';

export interface TriggerGradingParams {
  teamId: string;
  triggeredBy: string;
  force?: boolean;
}

export interface TriggerGradingResult {
  gradingAttemptId: string;
  status: string;
  skipped: boolean;
  idempotencyKey: string;
}

export async function triggerGrading({
  teamId,
  triggeredBy,
  force = false,
}: TriggerGradingParams): Promise<TriggerGradingResult> {
  // 1. Kiểm tra nhóm tồn tại và trạng thái hợp lệ
  const team = await getTeamRecord(teamId);
  if (!team) {
    throw new NotFoundError('Team', teamId);
  }

  if (team.status !== 'SUBMITTED') {
    throw new ValidationError('Chỉ nhóm đã nộp bài mới được chấm điểm.');
  }

  if (!team.latestSubmissionId) {
    throw new ValidationError('Nhóm chưa có bài nộp nào để chấm.');
  }

  // 2. Lấy cấu hình active
  const config = await getActiveGradingConfig();
  if (!config) {
    throw new Error('Chưa có GradingConfig active trong hệ thống.');
  }

  const rubric = await getActiveRubric();
  if (config.mode === 'RUBRIC' || config.mode === 'HYBRID') {
    if (!rubric) {
      throw new Error(`Chế độ ${config.mode} yêu cầu có Rubric active.`);
    }
  }

  // 3. Xác định model và idempotencyKey
  const model = config.model || (await getOpenAiModel());
  const idempotencyKey = buildIdempotencyKey({
    teamId,
    submissionId: team.latestSubmissionId,
    rubricVersion: rubric?.version,
    gradingConfigVersion: config.version,
    model,
  });

  // 4. Nếu không ép buộc chấm lại, kiểm tra bài đã chấm gần nhất có cùng cấu hình không
  if (!force) {
    const latestGraded = await getLatestGradedAttempt(teamId);
    if (latestGraded && latestGraded.idempotencyKey === idempotencyKey) {
      return {
        gradingAttemptId: latestGraded.gradingAttemptId,
        status: latestGraded.status,
        skipped: true,
        idempotencyKey,
      };
    }
  }

  // 5. Tạo attemptId và khóa team
  const gradingAttemptId = ulid();
  const nowIso = new Date().toISOString();

  await lockTeamAndCreateAttempt({
    teamId,
    gradingAttemptId,
    triggeredBy,
    idempotencyKey,
    rubricVersion: rubric?.version,
    gradingConfigVersion: config.version,
    model,
    nowIso,
  });

  // 6. Gửi message vào hàng đợi SQS
  try {
    await sendGradingMessage({
      teamId,
      submissionId: team.latestSubmissionId,
      gradingAttemptId,
      assignmentId: team.assignmentId,
      rubricVersion: rubric?.version,
      gradingConfigVersion: config.version,
      model,
      triggeredBy,
    });
  } catch (sqsErr) {
    // Bù trừ: mở khóa và đánh dấu attempt FAILED nếu gửi SQS lỗi
    await unlockTeamAndFailAttempt(
      teamId,
      gradingAttemptId,
      `Gửi hàng đợi SQS thất bại: ${sqsErr instanceof Error ? sqsErr.message : String(sqsErr)}`,
    );
    throw sqsErr;
  }

  return {
    gradingAttemptId,
    status: 'PENDING',
    skipped: false,
    idempotencyKey,
  };
}
