/**
 * Pipeline chấm bài AI (infra-plan mục 2, 2.5, 6.5): SQS queue + DLQ,
 * Lambda `grading-worker`, Lambda `grading-dlq-handler`, IAM least privilege,
 * CloudWatch alarms gửi SNS.
 */
import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import type { StackConfig } from '../config.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORKER_ENTRY = fileURLToPath(
  new URL('../../../services/api/src/handlers/gradingWorker.ts', import.meta.url),
);
const DLQ_ENTRY = fileURLToPath(
  new URL('../../../services/api/src/handlers/gradingDlq.ts', import.meta.url),
);
const LOCK_FILE = fileURLToPath(new URL('../../../package-lock.json', import.meta.url));

export interface GradingProps {
  config: StackConfig;
  table: dynamodb.Table;
  bucket: s3.Bucket;
  alarmTopic: sns.ITopic;
}

export class Grading extends Construct {
  readonly queue: sqs.Queue;
  readonly dlq: sqs.Queue;
  readonly worker: nodejs.NodejsFunction;
  readonly dlqHandler: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: GradingProps) {
    super(scope, id);
    const { config, table, bucket, alarmTopic } = props;

    // 1. Dead Letter Queue
    this.dlq = new sqs.Queue(this, 'GradingDlq', {
      queueName: `QuickGrading-${config.stage}-grading-dlq`,
      retentionPeriod: Duration.days(14),
      enforceSSL: true,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // 2. Main SQS Queue: visibility timeout 720s (>= 6 * Lambda timeout 120s)
    this.queue = new sqs.Queue(this, 'GradingQueue', {
      queueName: `QuickGrading-${config.stage}-grading-queue`,
      visibilityTimeout: Duration.seconds(720),
      deadLetterQueue: {
        queue: this.dlq,
        maxReceiveCount: 4,
      },
      enforceSSL: true,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
    });

    // 3. Worker Lambda
    const workerLogGroup = new logs.LogGroup(this, 'WorkerLogGroup', {
      logGroupName: `/aws/lambda/QuickGrading-${config.stage}-grading-worker`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.worker = new nodejs.NodejsFunction(this, 'WorkerFunction', {
      functionName: `QuickGrading-${config.stage}-grading-worker`,
      entry: WORKER_ENTRY,
      handler: 'handler',
      projectRoot: REPO_ROOT,
      depsLockFilePath: LOCK_FILE,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      timeout: Duration.seconds(120),
      logGroup: workerLogGroup,
      environment: {
        TABLE_NAME: table.tableName,
        BUCKET_NAME: bucket.bucketName,
        STAGE: config.stage,
        GRADING_QUEUE_URL: this.queue.queueUrl,
      },
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'node22',
        format: nodejs.OutputFormat.CJS,
        externalModules: [],
      },
    });

    // Worker event source: batchSize 1, reportBatchItemFailures bật, concurrency giới hạn 2
    this.worker.addEventSource(
      new lambdaEventSources.SqsEventSource(this.queue, {
        batchSize: 1,
        reportBatchItemFailures: true,
        maxConcurrency: 2,
      }),
    );

    // 4. DLQ Handler Lambda
    const dlqLogGroup = new logs.LogGroup(this, 'DlqLogGroup', {
      logGroupName: `/aws/lambda/QuickGrading-${config.stage}-grading-dlq-handler`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.dlqHandler = new nodejs.NodejsFunction(this, 'DlqHandlerFunction', {
      functionName: `QuickGrading-${config.stage}-grading-dlq-handler`,
      entry: DLQ_ENTRY,
      handler: 'handler',
      projectRoot: REPO_ROOT,
      depsLockFilePath: LOCK_FILE,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(30),
      logGroup: dlqLogGroup,
      environment: {
        TABLE_NAME: table.tableName,
        STAGE: config.stage,
      },
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'node22',
        format: nodejs.OutputFormat.CJS,
        externalModules: [],
      },
    });

    this.dlqHandler.addEventSource(
      new lambdaEventSources.SqsEventSource(this.dlq, {
        batchSize: 1,
      }),
    );

    // 5. IAM Permissions Least Privilege
    // Worker đọc file nộp từ S3
    this.worker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['s3:GetObject'],
        resources: [bucket.arnForObjects('submissions/*')],
      }),
    );

    // Worker truy cập DynamoDB
    this.worker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:ConditionCheckItem',
          'dynamodb:Query',
        ],
        resources: [table.tableArn, `${table.tableArn}/index/*`],
      }),
    );

    // Worker đọc OpenAI API Key và Model từ SSM Parameter Store
    this.worker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          Stack.of(this).formatArn({
            service: 'ssm',
            resource: 'parameter',
            resourceName: `quick-grading/${config.stage}/openai/*`,
          }),
        ],
      }),
    );

    // Worker giải mã KMS cho SSM SecureString
    this.worker.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:ViaService': `ssm.${Stack.of(this).region}.amazonaws.com`,
          },
        },
      }),
    );

    // DLQ Handler cập nhật DynamoDB
    this.dlqHandler.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['dynamodb:UpdateItem', 'dynamodb:GetItem'],
        resources: [table.tableArn],
      }),
    );

    // 6. CloudWatch Alarms
    // Báo động nếu có tin nhắn trong DLQ (> 0)
    const dlqMessagesMetric = this.dlq.metricApproximateNumberOfMessagesVisible({
      period: Duration.minutes(5),
      statistic: cloudwatch.Stats.MAXIMUM,
    });
    const dlqAlarm = new cloudwatch.Alarm(this, 'GradingDlqAlarm', {
      alarmName: `QuickGrading-${config.stage}-grading-dlq-messages`,
      alarmDescription: 'Có bài nộp rơi vào hàng đợi lỗi Dead Letter Queue.',
      metric: dlqMessagesMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dlqAlarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));

    // Báo động nếu Worker gặp lỗi (Errors >= 1)
    const workerErrorsMetric = this.worker.metricErrors({
      period: Duration.minutes(5),
      statistic: cloudwatch.Stats.SUM,
    });
    const workerErrorAlarm = new cloudwatch.Alarm(this, 'GradingWorkerErrorsAlarm', {
      alarmName: `QuickGrading-${config.stage}-grading-worker-errors`,
      alarmDescription: 'Lambda grading-worker gặp lỗi thực thi.',
      metric: workerErrorsMetric,
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    workerErrorAlarm.addAlarmAction(new cwActions.SnsAction(alarmTopic));
  }
}
