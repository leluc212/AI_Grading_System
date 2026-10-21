/**
 * Script kích hoạt chấm bài AI thủ công cho một nhóm (`trigger-grading.ts`).
 *
 * Cách dùng:
 *   npx tsx scripts/trigger-grading.ts --team <teamId>
 */
import { CloudFormationClient, DescribeStacksCommand } from '@aws-sdk/client-cloudformation';
import { triggerGrading } from '../src/services/gradingService.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

process.env.AWS_PROFILE ??= 'quick-grading';
process.env.AWS_REGION ??= 'ap-southeast-1';
process.env.STAGE ??= 'dev';
process.env.BUCKET_NAME ??= 'quick-grading-dev-497320113384';

async function readStackOutputs(stackName: string) {
  const cfn = new CloudFormationClient({ region: process.env.AWS_REGION });
  const res = await cfn.send(new DescribeStacksCommand({ StackName: stackName }));
  const stack = res.Stacks?.[0];
  if (!stack) {
    throw new Error(`Stack ${stackName} không tồn tại.`);
  }
  const tableName = stack.Outputs?.find((o) => o.OutputKey === 'TableName')?.OutputValue;
  const queueUrl = stack.Outputs?.find((o) => o.OutputKey === 'GradingQueueUrl')?.OutputValue;
  if (!tableName || !queueUrl) {
    throw new Error(`Không tìm thấy TableName hoặc GradingQueueUrl trong stack ${stackName}.`);
  }
  return { tableName, queueUrl };
}

async function findFirstTeamWithSubmission(tableName: string): Promise<string> {
  const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
  // Query GSI1 để tìm nhóm trong đợt a1111111-1111-4111-8111-111111111111
  const res = await ddb.send(
    new QueryCommand({
      TableName: tableName,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gpk',
      ExpressionAttributeValues: {
        ':gpk': 'ASSIGNMENT#a1111111-1111-4111-8111-111111111111#TEAMS',
      },
      Limit: 10,
    }),
  );

  const team = res.Items?.find((t) => t.latestSubmissionId);
  if (!team) {
    throw new Error(
      'Không tìm thấy nhóm nào đã có bài nộp trong đợt a1111111-1111-4111-8111-111111111111',
    );
  }
  return team.teamId as string;
}

export async function run() {
  const stackName = `QuickGrading-${process.env.STAGE}`;
  const { tableName, queueUrl } = await readStackOutputs(stackName);
  process.env.TABLE_NAME = tableName;
  process.env.GRADING_QUEUE_URL = queueUrl;

  const args = process.argv.slice(2);
  const teamArgIdx = args.indexOf('--team');
  let teamId: string | undefined;

  if (teamArgIdx !== -1 && args[teamArgIdx + 1]) {
    teamId = args[teamArgIdx + 1];
  } else if (args[0] && !args[0].startsWith('-')) {
    teamId = args[0];
  }

  if (!teamId) {
    console.log('[trigger-grading] Không có --team, đang tìm nhóm đã nộp bài trong bảng...');
    teamId = await findFirstTeamWithSubmission(tableName);
  }

  console.log(`[trigger-grading] Kích hoạt chấm bài cho nhóm: ${teamId}`);
  console.log(`[trigger-grading] Queue URL: ${queueUrl}`);

  const result = await triggerGrading({ teamId, triggeredBy: 'ADMIN' });
  console.log('\n===== KẾT QUẢ TRIGGER GRADING =====');
  console.log(`Team ID: ${teamId}`);
  console.log(`Attempt ID: ${result.gradingAttemptId}`);
  console.log(`Status: ${result.status}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Idempotency Key: ${result.idempotencyKey}`);
  console.log('====================================\n');
  console.log('[trigger-grading] Tin nhắn đã được gửi vào SQS hàng đợi chấm bài thành công!');
}

if (process.argv[1]?.endsWith('trigger-grading.ts')) {
  run().catch((err) => {
    console.error('[trigger-grading] Thất bại:', err);
    process.exit(1);
  });
}
