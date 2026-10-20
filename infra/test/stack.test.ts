import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildStackConfig } from '../lib/config.js';
import { QuickGradingStack } from '../lib/quick-grading-stack.js';

function synth(overrides: Record<string, unknown> = {}) {
  const ctx: Record<string, unknown> = {
    stage: 'dev',
    account: '497320113384',
    region: 'ap-southeast-1',
    alarmEmails: 'swat.lucle@gmail.com',
    allowedOrigins: 'http://localhost:5173,http://localhost:5174',
    budgetLimitUsd: 10,
    ...overrides,
  };
  const config = buildStackConfig((key) => ctx[key]);
  // Bỏ bundling Lambda trong test (không cần esbuild).
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new QuickGradingStack(app, `QuickGrading-${config.stage}`, {
    env: { account: config.account, region: config.region },
    config,
  });
  return Template.fromStack(stack);
}

type Statement = { Action: string | string[]; Resource: unknown; Effect: string };

function only<T>(record: Record<string, T>): [string, T] {
  const entries = Object.entries(record);
  expect(entries).toHaveLength(1);
  return entries[0];
}

let dev: Template;
let prod: Template;
let twoEmails: Template;

beforeAll(() => {
  dev = synth();
  prod = synth({ stage: 'prod' });
  twoEmails = synth({ alarmEmails: 'a@example.com, b@example.com' });
});

describe('S3 bucket', () => {
  it('private, SSE-S3, BucketOwnerEnforced, lifecycle, CORS, không versioning', () => {
    const [, bucket] = only(dev.findResources('AWS::S3::Bucket'));
    const p = (bucket as { Properties: Record<string, unknown> }).Properties;
    expect(p.BucketName).toBe('quick-grading-dev-497320113384');
    expect(p.PublicAccessBlockConfiguration).toEqual({
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    });
    expect(p.BucketEncryption).toEqual({
      ServerSideEncryptionConfiguration: [
        { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
      ],
    });
    expect(p.OwnershipControls).toEqual({ Rules: [{ ObjectOwnership: 'BucketOwnerEnforced' }] });
    expect(p.VersioningConfiguration).toBeUndefined();
    expect(p.LifecycleConfiguration).toEqual({
      Rules: [
        {
          Id: 'expire-pending-uploads',
          Status: 'Enabled',
          ExpirationInDays: 1,
          TagFilters: [{ Key: 'state', Value: 'pending' }],
        },
        {
          Id: 'abort-incomplete-multipart',
          Status: 'Enabled',
          AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
        },
      ],
    });
    expect(p.CorsConfiguration).toEqual({
      CorsRules: [
        {
          AllowedMethods: ['POST'],
          AllowedOrigins: ['http://localhost:5173', 'http://localhost:5174'],
          AllowedHeaders: ['*'],
          MaxAge: 3000,
        },
      ],
    });
  });

  it('bucket policy chặn non-TLS', () => {
    dev.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  it('CORS theo context allowedOrigins', () => {
    const t = synth({ allowedOrigins: 'https://grading.example.com' });
    t.hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: {
        CorsRules: [Match.objectLike({ AllowedOrigins: ['https://grading.example.com'] })],
      },
    });
  });
});

describe('DynamoDB', () => {
  it('on-demand, PK/SK, GSI1 ALL, TTL, PITR', () => {
    dev.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'QuickGrading-dev',
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'GSI1',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    });
  });

  it('removal: dev Delete, prod Retain (bảng và bucket)', () => {
    const [, devTable] = only(dev.findResources('AWS::DynamoDB::Table'));
    const [, prodTable] = only(prod.findResources('AWS::DynamoDB::Table'));
    const [, devBucket] = only(dev.findResources('AWS::S3::Bucket'));
    const [, prodBucket] = only(prod.findResources('AWS::S3::Bucket'));
    expect(devTable.DeletionPolicy).toBe('Delete');
    expect(prodTable.DeletionPolicy).toBe('Retain');
    expect(devBucket.DeletionPolicy).toBe('Delete');
    expect(prodBucket.DeletionPolicy).toBe('Retain');
  });
});

describe('Lambda public-api', () => {
  it('arm64, Node 22, 256MB, 10s, không VPC', () => {
    const [, fn] = only(dev.findResources('AWS::Lambda::Function'));
    const p = (fn as { Properties: Record<string, unknown> }).Properties;
    expect(p.Architectures).toEqual(['arm64']);
    expect(p.Runtime).toBe('nodejs22.x');
    expect(p.MemorySize).toBe(256);
    expect(p.Timeout).toBe(10);
    expect(p.VpcConfig).toBeUndefined();
    expect(p.Environment).toEqual({
      Variables: {
        TABLE_NAME: expect.anything(),
        BUCKET_NAME: expect.anything(),
        STAGE: 'dev',
      },
    });
    expect(JSON.stringify(p.Environment)).not.toMatch(/openai|api-key|SECRET/i);
  });

  it('log retention 14 ngày, không có Custom::LogRetention', () => {
    dev.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 14 });
    dev.resourceCountIs('Custom::LogRetention', 0);
  });
});

describe('IAM least privilege của public-api', () => {
  function roleStatements(t: Template): Statement[] {
    const [roleId, role] = only(t.findResources('AWS::IAM::Role'));
    expect((role as { Properties: Record<string, unknown> }).Properties.ManagedPolicyArns).toBe(
      undefined,
    );
    const policies = Object.values(t.findResources('AWS::IAM::Policy')).filter((p) =>
      JSON.stringify(p.Properties.Roles).includes(roleId),
    );
    expect(policies.length).toBeGreaterThan(0);
    return policies.flatMap((p) => p.Properties.PolicyDocument.Statement as Statement[]);
  }

  const actionsOf = (s: Statement) => (Array.isArray(s.Action) ? s.Action : [s.Action]);

  it('đúng tập action cho phép, không wildcard', () => {
    const statements = roleStatements(dev);
    const actions = new Set(statements.flatMap(actionsOf));
    expect([...actions].sort()).toEqual(
      [
        'dynamodb:ConditionCheckItem',
        'dynamodb:GetItem',
        'dynamodb:PutItem',
        'dynamodb:Query',
        'dynamodb:UpdateItem',
        'logs:CreateLogStream',
        'logs:PutLogEvents',
        's3:GetObject',
        's3:PutObject',
        's3:PutObjectTagging',
      ].sort(),
    );
    for (const action of actions) {
      expect(action).not.toContain('*');
      expect(action).not.toMatch(
        /^(dynamodb:(Scan|BatchGetItem|BatchWriteItem|DeleteItem)|s3:ListBucket|ssm:|sqs:|kms:)/,
      );
    }
    for (const s of statements) {
      expect(s.Effect).toBe('Allow');
      expect(JSON.stringify(s.Resource)).not.toBe('"*"');
    }
  });

  it('Query chỉ trên /index/GSI1; DynamoDB item chỉ trên ARN bảng', () => {
    const statements = roleStatements(dev);
    const query = statements.filter((s) => actionsOf(s).includes('dynamodb:Query'));
    expect(query).toHaveLength(1);
    expect(actionsOf(query[0])).toEqual(['dynamodb:Query']);
    const resource = JSON.stringify(query[0].Resource);
    expect(resource).toContain('/index/GSI1');
    expect(Array.isArray(query[0].Resource)).toBe(false);

    const items = statements.filter((s) => actionsOf(s).includes('dynamodb:GetItem'));
    expect(items).toHaveLength(1);
    expect(items[0].Resource).toEqual({
      'Fn::GetAtt': [expect.stringMatching(/Table/), 'Arn'],
    });
  });

  it('S3 chỉ trên submissions/*', () => {
    const statements = roleStatements(dev);
    const s3Statements = statements.filter((s) => actionsOf(s).some((a) => a.startsWith('s3:')));
    expect(s3Statements).toHaveLength(1);
    const resources = Array.isArray(s3Statements[0].Resource)
      ? s3Statements[0].Resource
      : [s3Statements[0].Resource];
    for (const r of resources) {
      expect(JSON.stringify(r)).toMatch(/\/submissions\/\*"\]\]\}$/);
    }
  });

  it('logs chỉ trên log group riêng', () => {
    const statements = roleStatements(dev);
    const logStatements = statements.filter((s) => actionsOf(s).some((a) => a.startsWith('logs:')));
    expect(logStatements).toHaveLength(1);
    expect(JSON.stringify(logStatements[0].Resource)).toMatch(/LogGroup.*Arn/);
  });
});

describe('Phase 1 không có SQS / OpenAI key', () => {
  it('0 SQS queue, không tham chiếu SSM OpenAI', () => {
    dev.resourceCountIs('AWS::SQS::Queue', 0);
    const json = JSON.stringify(dev.toJSON());
    expect(json.toLowerCase()).not.toContain('openai');
    expect(json).not.toContain('/quick-grading/');
    expect(json).not.toContain('ssm:');
  });
});

describe('HTTP API', () => {
  it('HTTP API + CORS origin theo context', () => {
    dev.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      ProtocolType: 'HTTP',
      CorsConfiguration: Match.objectLike({
        AllowOrigins: ['http://localhost:5173', 'http://localhost:5174'],
        AllowHeaders: ['content-type'],
      }),
    });
  });

  it('đúng 5 route', () => {
    const routes = Object.values(dev.findResources('AWS::ApiGatewayV2::Route')).map(
      (r) => r.Properties.RouteKey,
    );
    expect(routes.sort()).toEqual(
      [
        'GET /api/assignments',
        'GET /api/assignments/{assignmentId}',
        'GET /api/teams/check-name',
        'POST /api/submissions',
        'POST /api/submissions/{submissionId}/finalize',
      ].sort(),
    );
  });

  it('throttle stage 20/40, route nộp bài 2/5; stage phụ thuộc route', () => {
    const [, stage] = only(dev.findResources('AWS::ApiGatewayV2::Stage'));
    expect(stage.Properties.DefaultRouteSettings).toEqual({
      ThrottlingRateLimit: 20,
      ThrottlingBurstLimit: 40,
    });
    expect(stage.Properties.RouteSettings).toEqual({
      'POST /api/submissions': { ThrottlingRateLimit: 2, ThrottlingBurstLimit: 5 },
      'POST /api/submissions/{submissionId}/finalize': {
        ThrottlingRateLimit: 2,
        ThrottlingBurstLimit: 5,
      },
    });
    expect((stage.DependsOn as string[]).length).toBeGreaterThanOrEqual(2);
  });
});

describe('Monitoring', () => {
  it('1 topic, 1 subscription email mặc định', () => {
    dev.resourceCountIs('AWS::SNS::Topic', 1);
    dev.resourceCountIs('AWS::SNS::Subscription', 1);
    dev.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'swat.lucle@gmail.com',
    });
  });

  it('2 email -> 2 subscription, budget có 2 subscriber mỗi ngưỡng', () => {
    twoEmails.resourceCountIs('AWS::SNS::Subscription', 2);
    const [, budget] = only(twoEmails.findResources('AWS::Budgets::Budget'));
    for (const n of budget.Properties.NotificationsWithSubscribers) {
      expect(n.Subscribers).toEqual([
        { SubscriptionType: 'EMAIL', Address: 'a@example.com' },
        { SubscriptionType: 'EMAIL', Address: 'b@example.com' },
      ]);
    }
  });

  it('budget 10 USD/tháng, ngưỡng 50/80/100', () => {
    const [, budget] = only(dev.findResources('AWS::Budgets::Budget'));
    expect(budget.Properties.Budget).toMatchObject({
      BudgetType: 'COST',
      TimeUnit: 'MONTHLY',
      BudgetLimit: { Amount: 10, Unit: 'USD' },
    });
    const notifications = budget.Properties.NotificationsWithSubscribers as {
      Notification: Record<string, unknown>;
      Subscribers: unknown[];
    }[];
    expect(notifications.map((n) => n.Notification.Threshold)).toEqual([50, 80, 100]);
    for (const n of notifications) {
      expect(n.Notification).toMatchObject({
        NotificationType: 'ACTUAL',
        ComparisonOperator: 'GREATER_THAN',
        ThresholdType: 'PERCENTAGE',
      });
      expect(n.Subscribers).toEqual([
        { SubscriptionType: 'EMAIL', Address: 'swat.lucle@gmail.com' },
      ]);
    }
  });

  it('alarm 5xx -> SNS', () => {
    const [topicId] = only(dev.findResources('AWS::SNS::Topic'));
    dev.hasResourceProperties('AWS::CloudWatch::Alarm', {
      Namespace: 'AWS/ApiGateway',
      MetricName: '5xx',
      Statistic: 'Sum',
      Period: 300,
      Threshold: 1,
      ComparisonOperator: 'GreaterThanOrEqualToThreshold',
      TreatMissingData: 'notBreaching',
      Dimensions: Match.arrayWith([{ Name: 'Stage', Value: '$default' }]),
      AlarmActions: [{ Ref: topicId }],
    });
  });

  it('> 10 email -> synth lỗi', () => {
    const emails = Array.from({ length: 11 }, (_, i) => `u${i}@example.com`).join(',');
    expect(() => synth({ alarmEmails: emails })).toThrow(/at most 10/);
  });
});

describe('Tags và Outputs', () => {
  it('bucket, bảng, function có tag Project=QuickGrading', () => {
    for (const type of ['AWS::S3::Bucket', 'AWS::DynamoDB::Table', 'AWS::Lambda::Function']) {
      dev.hasResourceProperties(type, {
        Tags: Match.arrayWith([{ Key: 'Project', Value: 'QuickGrading' }]),
      });
    }
  });

  it('có output ApiUrl, BucketName, TableName', () => {
    dev.hasOutput('ApiUrl', {});
    dev.hasOutput('BucketName', {});
    dev.hasOutput('TableName', {});
  });
});
