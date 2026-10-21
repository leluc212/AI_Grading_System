/**
 * Lambda handler cho grading-worker (tiêu thụ hàng đợi SQS) (infra-plan mục 2.4, 6.5).
 */
import type { SQSEvent, SQSBatchResponse } from 'aws-lambda';
import { log } from '../lib/logger.js';
import { submissionObjectKey } from '../domain/keys.js';
import { readObjectText } from '../storage/s3.js';
import { getActiveRubric, getActiveGradingConfig } from '../repositories/configRepo.js';
import { claimGradingAttempt, completeGradingAttempt } from '../repositories/gradingRepo.js';
import { truncateSubmissionFiles } from '../grading/truncate.js';
import { buildGradingPrompt } from '../grading/promptBuilder.js';
import { getOpenAiApiKey } from '../config/ssm.js';
import { callOpenAiGrader, RetryableError } from '../grading/openaiGrader.js';
import { processGradingScore } from '../grading/scoring.js';
import type { GradingMessagePayload } from '../storage/sqs.js';

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const record of event.Records) {
    let payload: GradingMessagePayload | undefined;

    try {
      payload = JSON.parse(record.body) as GradingMessagePayload;
    } catch (parseErr) {
      log('error', 'Không thể parse JSON từ SQS message body', {
        errorName: parseErr instanceof Error ? parseErr.name : 'JsonParseError',
      });
      // Message hỏng không thể parse -> không retry
      continue;
    }

    const { teamId, submissionId, gradingAttemptId, assignmentId, model } = payload;

    const startMs = Date.now();
    const nowIso = new Date().toISOString();

    try {
      // 1. Chuyển trạng thái sang IN_PROGRESS có điều kiện (chống xử lý trùng lặp)
      const claimResult = await claimGradingAttempt(teamId, gradingAttemptId, nowIso);
      if (claimResult === 'ALREADY_COMPLETED' || claimResult === 'IN_PROGRESS') {
        log('info', `Bỏ qua attempt ${gradingAttemptId} (trạng thái: ${claimResult})`, {
          teamId,
          submissionId,
        });
        continue;
      }

      // 2. Đọc cấu hình active
      const config = await getActiveGradingConfig();
      if (!config) {
        throw new Error('Không tìm thấy GradingConfig active');
      }

      const rubric = await getActiveRubric();

      // 3. Tải nội dung bài nộp từ S3
      const mdKey = submissionObjectKey(assignmentId, teamId, submissionId, 'md');
      const xmlKey = submissionObjectKey(assignmentId, teamId, submissionId, 'xml');

      const [mdContent, xmlContent] = await Promise.all([
        readObjectText(mdKey),
        readObjectText(xmlKey),
      ]);

      if (!mdContent && !xmlContent) {
        throw new Error('Nội dung cả 2 file nộp đều rỗng hoặc không tải được từ S3');
      }

      // 4. Giới hạn dung lượng token đầu vào
      const {
        mdContent: finalMd,
        xmlContent: finalXml,
        truncated,
      } = truncateSubmissionFiles({
        mdContent,
        xmlContent,
        maxInputTokens: config.maxInputTokens ?? 50_000,
      });

      // 5. Dựng prompt có cấu trúc tách phần tĩnh/động
      const { systemInstructions, userMessage, cacheKey } = buildGradingPrompt({
        config,
        rubric,
        mdContent: finalMd,
        xmlContent: finalXml,
      });

      // 6. Lấy API key từ SSM
      const apiKey = await getOpenAiApiKey();

      // 7. Gọi mô hình OpenAI
      const actualModel = config.model || model || 'gpt-6.1-sol';
      const { raw, usage } = await callOpenAiGrader({
        apiKey,
        model: actualModel,
        reasoningEffort: config.reasoningEffort,
        maxOutputTokens: config.maxOutputTokens ?? 2_000,
        systemInstructions,
        userMessage,
        cacheKey,
      });

      // 8. Hậu xử lý kết quả ở server (tính điểm trọng số, kẹp thang 0-100, xác định review)
      const { score, feedback, needsReview, reviewStatus, criteriaScores } = processGradingScore({
        raw,
        config,
        rubric,
        truncated,
      });

      // 9. Ghi nhận trạng thái GRADED và mở khóa nhóm trong 1 transaction
      await completeGradingAttempt({
        teamId,
        gradingAttemptId,
        status: 'GRADED',
        score,
        aiFeedback: feedback,
        needsReview,
        reviewStatus,
        criteriaScores,
        usage,
        model: actualModel,
        truncated,
      });

      log('info', `Chấm bài thành công cho nhóm ${teamId}`, {
        teamId,
        submissionId,
        durationMs: Date.now() - startMs,
        status: 200,
      });
    } catch (err: unknown) {
      const isRetryable = err instanceof RetryableError;
      const errorMsg = err instanceof Error ? err.message : String(err);

      log('error', `Lỗi khi xử lý chấm bài nhóm ${teamId}: ${errorMsg}`, {
        teamId,
        submissionId,
        errorName: err instanceof Error ? err.name : 'UnknownError',
        durationMs: Date.now() - startMs,
      });

      if (isRetryable) {
        // Lỗi tạm thời (429, 5xx, timeout) -> yêu cầu SQS gửi lại
        batchItemFailures.push({ itemIdentifier: record.messageId });
      } else {
        // Lỗi vĩnh viễn (bad request, auth, quota, rỗng, không hợp lệ) -> ghi FAILED và mở khóa
        try {
          await completeGradingAttempt({
            teamId,
            gradingAttemptId,
            status: 'FAILED',
            errorMessage: errorMsg.slice(0, 500),
            model,
          });
        } catch (failErr) {
          log('error', `Không thể ghi trạng thái FAILED cho attempt ${gradingAttemptId}`, {
            errorName: failErr instanceof Error ? failErr.name : 'CompleteFailError',
          });
        }
      }
    }
  }

  return { batchItemFailures };
}
