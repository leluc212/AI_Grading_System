/**
 * Script seed Rubric và GradingConfig mặc định cho stack dev (`QuickGrading-dev`).
 *
 * Idempotent: ghi bản ghi version 1 và trỏ con trỏ ACTIVE vào version 1.
 */
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import type { Rubric, GradingConfig } from '@quick-grading/shared-types';
import { saveRubricVersion, saveGradingConfigVersion } from '../src/repositories/configRepo.js';

process.env.AWS_PROFILE ??= 'quick-grading';
process.env.AWS_REGION ??= 'ap-southeast-1';
process.env.STAGE ??= 'dev';
process.env.BUCKET_NAME ??= 'quick-grading-dev-497320113384';

export const SEED_RUBRIC: Rubric = {
  rubricId: 'default',
  version: 1,
  isActive: true,
  createdAt: '2024-09-01T08:00:00.000Z',
  updatedAt: '2024-09-01T08:00:00.000Z',
  criteria: [
    {
      id: 'correctness',
      label: 'Tính đúng đắn (Correctness)',
      description: 'Mã nguồn giải quyết đúng yêu cầu bài toán, logic thuật toán chính xác.',
      weight: 40,
    },
    {
      id: 'code_quality',
      label: 'Chất lượng mã nguồn (Code Quality)',
      description: 'Cấu trúc code sạch, đặt tên biến có nghĩa, hàm ngắn gọn modular.',
      weight: 30,
    },
    {
      id: 'performance',
      label: 'Hiệu năng và Tài nguyên (Performance)',
      description: 'Tối ưu độ phức tạp thời gian và không gian, không rò rỉ tài nguyên.',
      weight: 15,
    },
    {
      id: 'edge_cases',
      label: 'Xử lý biên và Ngoại lệ (Edge Cases & Errors)',
      description: 'Bắt lỗi hợp lý, kiểm tra dữ liệu đầu vào rỗng, giới hạn mảng, v.v.',
      weight: 15,
    },
  ],
};

export const SEED_GRADING_CONFIG: GradingConfig = {
  configId: 'default',
  version: 1,
  mode: 'RUBRIC',
  autoGradeOnSubmit: true,
  isActive: true,
  systemPrompt:
    'Bạn là trợ giảng chấm bài lập trình khắt khe nhưng khách quan. Hãy đọc kỹ mã nguồn của sinh viên, đánh giá từng tiêu chí trong Rubric với thang điểm từ 0 đến 100, và cung cấp nhận xét súc tích, mang tính xây dựng.',
  maxInputTokens: 50000,
  maxOutputTokens: 2000,
  model: 'gpt-6.1-sol',
  createdAt: '2024-09-01T08:00:00.000Z',
  createdBy: 'admin',
};

async function readTableNameFromStack(stackName: string): Promise<string> {
  const cfn = new CloudFormationClient({ region: process.env.AWS_REGION });
  const res = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = res.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack ${stackName} không tồn tại.`);
  }
  const output = stack.Outputs?.find((o) => o.OutputKey === 'TableName');
  if (!output?.OutputValue) {
    throw new Error(`Output TableName không tìm thấy trong stack ${stackName}.`);
  }
  return output.OutputValue;
}

export async function run() {
  const stackName = `QuickGrading-${process.env.STAGE}`;
  const tableName = process.env.TABLE_NAME || (await readTableNameFromStack(stackName));
  process.env.TABLE_NAME = tableName;

  console.log(`[seed-grading] Sử dụng bảng: ${tableName}`);

  await saveRubricVersion(SEED_RUBRIC);
  console.log(`[seed-grading] Đã lưu và kích hoạt Rubric v${SEED_RUBRIC.version} (${SEED_RUBRIC.rubricId})`);

  await saveGradingConfigVersion(SEED_GRADING_CONFIG);
  console.log(
    `[seed-grading] Đã lưu và kích hoạt GradingConfig v${SEED_GRADING_CONFIG.version} (mode: ${SEED_GRADING_CONFIG.mode}, autoGradeOnSubmit: ${SEED_GRADING_CONFIG.autoGradeOnSubmit})`,
  );
}

if (process.argv[1]?.endsWith('seed-grading.ts')) {
  run().catch((err) => {
    console.error('[seed-grading] Thất bại:', err);
    process.exit(1);
  });
}
