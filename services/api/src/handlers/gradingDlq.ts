/**
 * Lambda handler cho grading-dlq (Dead Letter Queue) (infra-plan mục 2.4, 6.5).
 *
 * Khi một bài nộp thất bại quá maxReceiveCount (4 lần), DLQ handler sẽ
 * đánh dấu attempt thành FAILED và giải phóng khóa cho nhóm để không bị kẹt vĩnh viễn.
 */
import type { SQSEvent } from 'aws-lambda';
import { log } from '../lib/logger.js';
import { completeGradingAttempt } from '../repositories/gradingRepo.js';
import type { GradingMessagePayload } from '../storage/sqs.js';

async function processDlqRecord(record: SQSEvent['Records'][number]): Promise<void> {
  let payload: GradingMessagePayload | undefined;
  try {
    payload = JSON.parse(record.body) as GradingMessagePayload;
  } catch {
    return;
  }

  const { teamId, gradingAttemptId } = payload;

  try {
    await completeGradingAttempt({
      teamId,
      gradingAttemptId,
      status: 'FAILED',
      errorMessage: 'Chấm bài thất bại do vượt quá số lần thử lại tối đa của hàng đợi.',
    });

    log(
      'error',
      `DLQ đã xử lý attempt ${gradingAttemptId} của nhóm ${teamId} -> chuyển sang FAILED và mở khóa`,
      {
        teamId,
      },
    );
  } catch (err) {
    log('error', `Lỗi khi DLQ xử lý attempt ${gradingAttemptId}`, {
      errorName: err instanceof Error ? err.name : 'DlqProcessError',
    });
  }
}

export async function handler(event: SQSEvent): Promise<void> {
  await Promise.all(event.Records.map((r) => processDlqRecord(r)));
}
