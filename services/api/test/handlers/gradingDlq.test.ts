import { describe, it, expect, beforeEach } from 'vitest';
import type { SQSEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { handler } from '../../src/handlers/gradingDlq.js';

describe('gradingDlq handler', () => {
  const ddbMock = mockClient(DynamoDBDocumentClient);

  beforeEach(() => {
    ddbMock.reset();
    process.env.TABLE_NAME = 'QuickGrading-dev';
    process.env.STAGE = 'dev';
    process.env.BUCKET_NAME = 'quick-grading-dev-test';
  });

  const sampleDlqEvent: SQSEvent = {
    Records: [
      {
        messageId: 'dlq-msg-1',
        receiptHandle: 'handle-dlq',
        body: JSON.stringify({
          teamId: 't1',
          gradingAttemptId: 'att-failed',
        }),
        attributes: {} as never,
        messageAttributes: {},
        md5OfBody: '',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:...-dlq',
        awsRegion: 'ap-southeast-1',
      },
    ],
  };

  it('xử lý message từ DLQ, đánh dấu FAILED và mở khóa team', async () => {
    ddbMock.on(TransactWriteCommand).resolves({});

    await handler(sampleDlqEvent);
    expect(ddbMock.commandCalls(TransactWriteCommand)).toHaveLength(1);
  });
});
