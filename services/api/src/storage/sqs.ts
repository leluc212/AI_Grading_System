/**
 * Giao tiếp với Amazon SQS cho hàng đợi chấm bài (infra-plan mục 2, 6.5).
 */
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { readEnv } from '../lib/env.js';

let sqsClient: SQSClient | undefined;

function getSqsClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient({ region: process.env.AWS_REGION ?? 'ap-southeast-1' });
  }
  return sqsClient;
}

export function _setSqsClientForTesting(client: SQSClient | undefined): void {
  sqsClient = client;
}

export interface GradingMessagePayload {
  teamId: string;
  submissionId: string;
  gradingAttemptId: string;
  assignmentId: string;
  rubricVersion?: number;
  gradingConfigVersion: number;
  model: string;
  triggeredBy: string;
}

/**
 * Gửi payload chấm bài vào hàng đợi SQS.
 */
export async function sendGradingMessage(payload: GradingMessagePayload): Promise<string> {
  const { gradingQueueUrl } = readEnv();
  if (!gradingQueueUrl) {
    throw new Error('Biến môi trường GRADING_QUEUE_URL chưa được cấu hình.');
  }

  const client = getSqsClient();
  const res = await client.send(
    new SendMessageCommand({
      QueueUrl: gradingQueueUrl,
      MessageBody: JSON.stringify(payload),
    }),
  );

  return res.MessageId ?? '';
}
