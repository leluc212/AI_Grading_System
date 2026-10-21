/**
 * Script kiểm tra kết nối OpenAI API qua SSM Parameter Store (`smoke-openai.ts`).
 *
 * Kiểm tra:
 * 1. Đọc API Key từ SSM Parameter Store `/quick-grading/{stage}/openai/api-key`.
 * 2. Đọc Model từ SSM hoặc fallback `gpt-6.1-sol`.
 * 3. Gửi payload chấm bài mẫu đến OpenAI Structured Outputs API.
 * 4. In kết quả tóm tắt điểm và tokens tiêu thụ (tuyệt đối không in API Key).
 */
import { getOpenAiApiKey, getOpenAiModel } from '../src/config/ssm.js';
import { callOpenAiGrader } from '../src/grading/openaiGrader.js';
import { buildGradingPrompt } from '../src/grading/promptBuilder.js';
import { processGradingScore } from '../src/grading/scoring.js';
import type { Rubric, GradingConfig } from '@quick-grading/shared-types';

process.env.AWS_PROFILE ??= 'quick-grading';
process.env.AWS_REGION ??= 'ap-southeast-1';
process.env.STAGE ??= 'dev';
process.env.TABLE_NAME ??= 'QuickGrading-dev';
process.env.BUCKET_NAME ??= 'quick-grading-dev-497320113384';

const SAMPLE_RUBRIC: Rubric = {
  rubricId: 'test-smoke-rubric',
  version: 1,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  criteria: [
    {
      id: 'correctness',
      label: 'Độ chính xác thuật toán',
      weight: 60,
    },
    {
      id: 'code_quality',
      label: 'Chất lượng code',
      weight: 40,
    },
  ],
};

const SAMPLE_CONFIG: GradingConfig = {
  configId: 'default',
  version: 1,
  mode: 'RUBRIC',
  autoGradeOnSubmit: true,
  isActive: true,
  systemPrompt:
    'Bạn là giám khảo chấm bài thực hành lập trình. Hãy đánh giá mã nguồn ngắn gọn và công tâm.',
  maxInputTokens: 10000,
  maxOutputTokens: 1000,
  model: 'gpt-6.1-sol',
  createdAt: new Date().toISOString(),
  createdBy: 'smoke-test',
};

const SAMPLE_MD = `# Báo cáo bài tập
Nhóm đã triển khai bài toán Two Sum bằng Hash Map O(N).
`;

const SAMPLE_XML = `<file path="main.py">
def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        diff = target - n
        if diff in seen:
            return [seen[diff], i]
        seen[n] = i
    return []

print(two_sum([2, 7, 11, 15], 9))
</file>`;

export async function run() {
  console.log(
    `[smoke-openai] Kiểm tra SSM Parameter Store (Stage: ${process.env.STAGE}, Region: ${process.env.AWS_REGION})...`,
  );

  const apiKey = await getOpenAiApiKey();
  if (!apiKey || apiKey.length < 10) {
    throw new Error('API Key đọc từ SSM không hợp lệ hoặc rỗng.');
  }
  console.log(
    `[smoke-openai] Đã nạp thành công OpenAI API Key từ SSM (độ dài: ${apiKey.length} ký tự).`,
  );

  const ssmModel = await getOpenAiModel();
  const actualModel = ssmModel || 'gpt-6.1-sol';
  console.log(`[smoke-openai] Sử dụng Model: ${actualModel}`);

  const { systemInstructions, userMessage, cacheKey } = buildGradingPrompt({
    config: SAMPLE_CONFIG,
    rubric: SAMPLE_RUBRIC,
    mdContent: SAMPLE_MD,
    xmlContent: SAMPLE_XML,
  });

  console.log('[smoke-openai] Đang gửi bài nộp mẫu qua OpenAI Structured Outputs API...');
  const start = Date.now();
  const { raw, usage } = await callOpenAiGrader({
    apiKey,
    model: actualModel,
    maxOutputTokens: SAMPLE_CONFIG.maxOutputTokens ?? 1000,
    systemInstructions,
    userMessage,
    cacheKey,
  });
  const duration = Date.now() - start;

  const { score, feedback, needsReview, criteriaScores } = processGradingScore({
    raw,
    config: SAMPLE_CONFIG,
    rubric: SAMPLE_RUBRIC,
    truncated: false,
  });

  console.log('\n===== KẾT QUẢ CHẤM THỬ NGHIỆM OPENAI =====');
  console.log(`Thời gian thực thi: ${duration} ms`);
  console.log(`Điểm tổng (score): ${score}/100`);
  console.log(`Cần xem lại (needsReview): ${needsReview}`);
  console.log(
    `Tổng tokens (input/output/cached): ${usage.inputTokens} / ${usage.outputTokens} / ${usage.cachedInputTokens}`,
  );
  console.log(`Nhận xét chung: ${feedback}`);
  console.log('Điểm từng tiêu chí:');
  for (const c of criteriaScores) {
    console.log(` - [${c.criterionId}] ${c.score}/100: ${c.comment}`);
  }
  console.log('===========================================\n');
  console.log('[smoke-openai] Hoàn thành kiểm tra OpenAI thành công rực rỡ!');
}

if (process.argv[1]?.endsWith('smoke-openai.ts')) {
  run().catch((err) => {
    console.error('[smoke-openai] Kiểm tra thất bại:', err);
    process.exit(1);
  });
}
