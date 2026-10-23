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
          AllowedMethods: ['POST', 'GET'],
          AllowedOrigins: ['http://localhost:5173', 'http://localhost:5174'],
          AllowedHeaders: ['*'],
          MaxAge: 3000,
        },
      ],
    });
  });

  it('bucket policy chặn non-TLS', () => {
    expect(() => {
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
    }).not.toThrow();
  });

  it('CORS theo context allowedOrigins', () => {
    const t = synth({ allowedOrigins: 'https://grading.example.com' });
    expect(() => {
      t.hasResourceProperties('AWS::S3::Bucket', {
        CorsConfiguration: {
          CorsRules: [Match.objectLike({ AllowedOrigins: ['https://grading.example.com'] })],
        },
      });
    }).not.toThrow();
  });
});

describe('DynamoDB', () => {
  it('on-demand, PK/SK, GSI1 ALL, TTL, PITR', () => {
    expect(() => {
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
    }).not.toThrow();
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
    const fns = dev.findResources('AWS::Lambda::Function');
    const [, fn] = Object.entries(fns).find(([id]) => id.includes('PublicApi'))!;
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
        GRADING_QUEUE_URL: expect.anything(),
      },
    });
    expect(JSON.stringify(p.Environment)).not.toMatch(/openai|api-key|SECRET/i);
  });

  it('log retention 14 ngày, không có Custom::LogRetention', () => {
    expect(() => {
      dev.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 14 });
      dev.resourceCountIs('Custom::LogRetention', 0);
    }).not.toThrow();
  });
});

describe('IAM least privilege của public-api', () => {
  function publicApiRoleStatements(t: Template): Statement[] {
    const fns = t.findResources('AWS::Lambda::Function');
    const [, apiFn] = Object.entries(fns).find(([id]) => id.includes('PublicApi'))!;
    const roleRef = (apiFn.Properties.Role as { 'Fn::GetAtt': [string, string] })['Fn::GetAtt'][0];
    const role = t.findResources('AWS::IAM::Role')[roleRef];
    expect((role as { Properties: Record<string, unknown> }).Properties.ManagedPolicyArns).toBe(
      undefined,
    );
    const policies = Object.values(t.findResources('AWS::IAM::Policy')).filter((p) =>
      JSON.stringify(p.Properties.Roles).includes(roleRef),
    );
    expect(policies.length).toBeGreaterThan(0);
    return policies.flatMap((p) => p.Properties.PolicyDocument.Statement as Statement[]);
  }

  const actionsOf = (s: Statement) => (Array.isArray(s.Action) ? s.Action : [s.Action]);

  it('đúng tập action cho phép, không wildcard', () => {
    const statements = publicApiRoleStatements(dev);
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
        'sqs:GetQueueAttributes',
        'sqs:GetQueueUrl',
        'sqs:SendMessage',
      ].sort(),
    );
    for (const action of actions) {
      expect(action).not.toContain('*');
      expect(action).not.toMatch(
        /^(dynamodb:(Scan|BatchGetItem|BatchWriteItem|DeleteItem)|s3:ListBucket|ssm:|kms:)/,
      );
    }
    for (const s of statements) {
      expect(s.Effect).toBe('Allow');
      expect(JSON.stringify(s.Resource)).not.toBe('"*"');
    }
  });

  it('Query chỉ trên /index/GSI1; DynamoDB item chỉ trên ARN bảng', () => {
    const statements = publicApiRoleStatements(dev);
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
    const statements = publicApiRoleStatements(dev);
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
    const statements = publicApiRoleStatements(dev);
    const logStatements = statements.filter((s) => actionsOf(s).some((a) => a.startsWith('logs:')));
    expect(logStatements).toHaveLength(1);
    expect(JSON.stringify(logStatements[0].Resource)).toMatch(/LogGroup.*Arn/);
  });
});

describe('Phase 2 Grading Pipeline (SQS, Worker, DLQ, Alarms)', () => {
  it('tạo đúng 2 SQS queues: main queue và DLQ', () => {
    expect(() => {
      dev.resourceCountIs('AWS::SQS::Queue', 2);
      dev.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'QuickGrading-dev-grading-queue',
        VisibilityTimeout: 720,
        RedrivePolicy: Match.objectLike({
          maxReceiveCount: 4,
        }),
      });
      dev.hasResourceProperties('AWS::SQS::Queue', {
        QueueName: 'QuickGrading-dev-grading-dlq',
        MessageRetentionPeriod: 1209600, // 14 days
      });
    }).not.toThrow();
  });

  it('tạo Lambda grading-worker, grading-dlq-handler và admin-api với cấu hình chuẩn', () => {
    const fns = dev.findResources('AWS::Lambda::Function');
    expect(Object.keys(fns)).toHaveLength(4); // public-api, worker, dlq-handler, admin-api

    const [, worker] = Object.entries(fns).find(([id]) => id.includes('WorkerFunction'))!;
    expect(worker.Properties.Architectures).toEqual(['arm64']);
    expect(worker.Properties.MemorySize).toBe(512);
    expect(worker.Properties.Timeout).toBe(120);

    const [, dlqHandler] = Object.entries(fns).find(([id]) => id.includes('DlqHandlerFunction'))!;
    expect(dlqHandler.Properties.Architectures).toEqual(['arm64']);
    expect(dlqHandler.Properties.MemorySize).toBe(256);
    expect(dlqHandler.Properties.Timeout).toBe(30);

    const [, adminApi] = Object.entries(fns).find(([id]) => id.includes('AdminApi'))!;
    expect(adminApi.Properties.Architectures).toEqual(['arm64']);
    expect(adminApi.Properties.MemorySize).toBe(256);
    expect(adminApi.Properties.Timeout).toBe(15);
  });

  it('cấu hình 2 EventSourceMapping với SQS batchSize và maxConcurrency', () => {
    expect(() => {
      dev.resourceCountIs('AWS::Lambda::EventSourceMapping', 2);
      dev.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
        BatchSize: 1,
        FunctionResponseTypes: ['ReportBatchItemFailures'],
        ScalingConfig: {
          MaximumConcurrency: 2,
        },
      });
      dev.hasResourceProperties('AWS::Lambda::EventSourceMapping', {
        BatchSize: 1,
      });
    }).not.toThrow();
  });

  it('cấu hình CloudWatch Alarms cho DLQ messages và Worker errors', () => {
    expect(() => {
      dev.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'QuickGrading-dev-grading-dlq-messages',
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        Threshold: 1,
        EvaluationPeriods: 1,
      });
      dev.hasResourceProperties('AWS::CloudWatch::Alarm', {
        AlarmName: 'QuickGrading-dev-grading-worker-errors',
        ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        Threshold: 1,
        EvaluationPeriods: 1,
      });
    }).not.toThrow();
  });
});

describe('HTTP API', () => {
  it('HTTP API + CORS origin theo context và headers authorization', () => {
    expect(() => {
      dev.hasResourceProperties('AWS::ApiGatewayV2::Api', {
        ProtocolType: 'HTTP',
        CorsConfiguration: Match.objectLike({
          AllowOrigins: ['http://localhost:5173', 'http://localhost:5174'],
          AllowHeaders: ['content-type', 'authorization'],
        }),
      });
    }).not.toThrow();
  });

  it('đúng các route public (5) và các route admin có bảo vệ', () => {
    const rawRoutes = dev.findResources('AWS::ApiGatewayV2::Route');
    const routes = Object.values(rawRoutes);

    const publicRouteKeys = [
      'GET /api/assignments',
      'GET /api/assignments/{assignmentId}',
      'GET /api/teams/check-name',
      'POST /api/submissions',
      'POST /api/submissions/{submissionId}/finalize',
    ];

    for (const key of publicRouteKeys) {
      const r = routes.find((item) => item.Properties.RouteKey === key);
      expect(r).toBeDefined();
      expect(r!.Properties.AuthorizationType).toBe('NONE');
    }

    const adminRouteKeys = [
      'POST /api/assignments',
      'PATCH /api/assignments/{assignmentId}/status',
      'GET /api/assignments/{assignmentId}/teams',
      'GET /api/teams/{teamId}',
      'PATCH /api/teams/{teamId}/unlock',
      'GET /api/teams/{teamId}/files',
      'GET /api/assignments/{assignmentId}/export-data',
      'POST /api/teams/{teamId}/grading',
      'POST /api/assignments/{assignmentId}/grading',
      'GET /api/teams/{teamId}/grading/history',
      'PATCH /api/teams/{teamId}/grading/{gradingAttemptId}/review',
      'GET /api/rubrics',
      'GET /api/rubrics/active',
      'POST /api/rubrics',
      'GET /api/grading-config',
      'GET /api/grading-config/active',
      'POST /api/grading-config',
    ];

    for (const key of adminRouteKeys) {
      const r = routes.find((item) => item.Properties.RouteKey === key);
      expect(r).toBeDefined();
      expect(r!.Properties.AuthorizationType).toBe('JWT');
      expect(r!.Properties.AuthorizerId).toBeDefined();
    }
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

describe('Phase 3.1 Cognito & Admin Auth', () => {
  it('tạo UserPool với AllowAdminCreateUserOnly = true (self-signup tắt)', () => {
    expect(() => {
      dev.resourceCountIs('AWS::Cognito::UserPool', 1);
      dev.hasResourceProperties('AWS::Cognito::UserPool', {
        UserPoolName: 'QuickGrading-dev-admins',
        AdminCreateUserConfig: {
          AllowAdminCreateUserOnly: true,
        },
        AliasAttributes: ['email'],
      });
    }).not.toThrow();
  });

  it('tạo UserPoolClient không secret cho SPA web admin', () => {
    expect(() => {
      dev.resourceCountIs('AWS::Cognito::UserPoolClient', 1);
      dev.hasResourceProperties('AWS::Cognito::UserPoolClient', {
        ClientName: 'QuickGrading-dev-admin-web',
        GenerateSecret: false,
        ExplicitAuthFlows: [
          'ALLOW_USER_PASSWORD_AUTH',
          'ALLOW_USER_SRP_AUTH',
          'ALLOW_REFRESH_TOKEN_AUTH',
        ],
      });
    }).not.toThrow();
  });

  it('tạo HttpJwtAuthorizer trên API Gateway v2 liên kết UserPool', () => {
    expect(() => {
      dev.resourceCountIs('AWS::ApiGatewayV2::Authorizer', 1);
      dev.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
        AuthorizerType: 'JWT',
        IdentitySource: ['$request.header.Authorization'],
      });
    }).not.toThrow();
  });
});

describe('Monitoring', () => {
  it('1 topic, 1 subscription email mặc định', () => {
    expect(() => {
      dev.resourceCountIs('AWS::SNS::Topic', 1);
      dev.resourceCountIs('AWS::SNS::Subscription', 1);
      dev.hasResourceProperties('AWS::SNS::Subscription', {
        Protocol: 'email',
        Endpoint: 'swat.lucle@gmail.com',
      });
    }).not.toThrow();
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
    expect(() => {
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
    }).not.toThrow();
  });

  it('> 10 email -> synth lỗi', () => {
    const emails = Array.from({ length: 11 }, (_, i) => `u${i}@example.com`).join(',');
    expect(() => synth({ alarmEmails: emails })).toThrow(/at most 10/);
  });
});

describe('Tags và Outputs', () => {
  it('bucket, bảng, function có tag Project=QuickGrading', () => {
    expect(() => {
      for (const type of ['AWS::S3::Bucket', 'AWS::DynamoDB::Table', 'AWS::Lambda::Function']) {
        dev.hasResourceProperties(type, {
          Tags: Match.arrayWith([{ Key: 'Project', Value: 'QuickGrading' }]),
        });
      }
    }).not.toThrow();
  });

  it('có output ApiUrl, BucketName, TableName, GradingQueueUrl, GradingDlqUrl, UserPoolId, UserPoolClientId', () => {
    expect(() => {
      dev.hasOutput('ApiUrl', {});
      dev.hasOutput('BucketName', {});
      dev.hasOutput('TableName', {});
      dev.hasOutput('GradingQueueUrl', {});
      dev.hasOutput('GradingDlqUrl', {});
      dev.hasOutput('UserPoolId', {});
      dev.hasOutput('UserPoolClientId', {});
    }).not.toThrow();
  });
});
