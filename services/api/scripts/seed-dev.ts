/**
 * Seed data đợt chấm mẫu cho stack dev (`QuickGrading-dev`).
 *
 * Chỉ ghi 2 đợt:
 *   1. a1111111-1111-4111-8111-111111111111 - OPEN
 *   2. a2222222-2222-4222-8222-222222222222 - CLOSED
 *
 * Idempotent: dùng ConditionExpression attribute_not_exists(PK),
 * nếu đã tồn tại thì bỏ qua và không ghi đè.
 */
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

process.env.AWS_PROFILE ??= 'quick-grading';
process.env.AWS_REGION ??= 'ap-southeast-1';

export interface SeedAssignmentInput {
  assignmentId: string;
  assignmentName: string;
  status: 'OPEN' | 'CLOSED';
  createdAt: string;
  createdBy: string;
  submittedTeamCount: number;
}

export function buildAssignmentItem(input: SeedAssignmentInput) {
  return {
    PK: `ASSIGNMENT#${input.assignmentId}`,
    SK: 'META',
    GSI1PK: 'ASSIGNMENTS',
    GSI1SK: input.createdAt,
    assignmentId: input.assignmentId,
    assignmentName: input.assignmentName,
    status: input.status,
    createdAt: input.createdAt,
    createdBy: input.createdBy,
    submittedTeamCount: input.submittedTeamCount,
  };
}

export const SEED_ASSIGNMENTS: SeedAssignmentInput[] = [
  {
    assignmentId: 'a1111111-1111-4111-8111-111111111111',
    assignmentName: 'Đợt 1 - Lập trình Web - K21',
    status: 'OPEN',
    createdAt: '2024-09-01T08:00:00.000Z',
    createdBy: 'admin',
    submittedTeamCount: 0,
  },
  {
    assignmentId: 'a2222222-2222-4222-8222-222222222222',
    assignmentName: 'Đợt 2 - Cấu trúc dữ liệu - K20',
    status: 'CLOSED',
    createdAt: '2024-09-01T08:00:01.000Z',
    createdBy: 'admin',
    submittedTeamCount: 0,
  },
];

export async function readTableNameFromStack(stackName: string): Promise<string> {
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

export async function seedDevAssignments(tableName: string) {
  if (tableName !== 'QuickGrading-dev') {
    throw new Error(
      `An toàn: seed:dev chỉ chạy trên bảng 'QuickGrading-dev', bảng hiện tại là '${tableName}'.`,
    );
  }

  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }), {
    marshallOptions: { removeUndefinedValues: true },
  });

  for (const seed of SEED_ASSIGNMENTS) {
    const item = buildAssignmentItem(seed);
    try {
      await ddb.send(
        new PutCommand({
          TableName: tableName,
          Item: item,
          ConditionExpression: 'attribute_not_exists(PK)',
        }),
      );
      console.log(`[seed-dev] Đã tạo đợt ${seed.assignmentId} (${seed.status})`);
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === 'ConditionalCheckFailedException') {
        console.log(`[seed-dev] Đợt ${seed.assignmentId} đã tồn tại, bỏ qua.`);
      } else {
        throw err;
      }
    }
  }
}

// Chạy trực tiếp khi file được gọi qua CLI
const isDirectRun =
  import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` ||
  process.argv[1]?.endsWith('seed-dev.ts');

if (isDirectRun) {
  const stackName = process.env.QG_STACK_NAME ?? 'QuickGrading-dev';
  try {
    const tableName = await readTableNameFromStack(stackName);
    console.log(`[seed-dev] Đang seed vào bảng ${tableName}...`);
    await seedDevAssignments(tableName);
    console.log('[seed-dev] Hoàn tất.');
  } catch (err) {
    console.error('[seed-dev] Lỗi:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
