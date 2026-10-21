/**
 * Construct Lambda `admin-api` và gắn các route Admin có JWT Authorizer (infra-plan mục 3, 3.1, 5).
 *
 * Mọi route Admin đều được bảo vệ bởi HttpJwtAuthorizer cấp bởi Cognito User Pool.
 */
import { fileURLToPath } from 'node:url';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import type { StackConfig } from '../config.js';
import { GSI1_NAME } from './database.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ENTRY = fileURLToPath(
  new URL('../../../services/api/src/handlers/adminApi.ts', import.meta.url),
);
const LOCK_FILE = fileURLToPath(new URL('../../../package-lock.json', import.meta.url));

export interface AdminApiProps {
  config: StackConfig;
  table: dynamodb.Table;
  bucket: s3.Bucket;
  api: apigwv2.HttpApi;
  authorizer: apigwv2.IHttpRouteAuthorizer;
  gradingQueue: sqs.Queue;
}

export class AdminApi extends Construct {
  readonly fn: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: AdminApiProps) {
    super(scope, id);
    const { config, table, bucket, api, authorizer, gradingQueue } = props;

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/QuickGrading-${config.stage}-admin-api`,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'quick-grading admin-api (least privilege)',
    });

    this.fn = new nodejs.NodejsFunction(this, 'Function', {
      functionName: `QuickGrading-${config.stage}-admin-api`,
      entry: ENTRY,
      handler: 'handler',
      projectRoot: REPO_ROOT,
      depsLockFilePath: LOCK_FILE,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(15),
      role,
      logGroup,
      environment: {
        TABLE_NAME: table.tableName,
        BUCKET_NAME: bucket.bucketName,
        STAGE: config.stage,
        GRADING_QUEUE_URL: gradingQueue.queueUrl,
      },
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'node22',
        format: nodejs.OutputFormat.CJS,
        externalModules: [],
      },
    });

    // IAM Least Privilege cho Admin Lambda
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'LogsOnlyThisGroup',
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [logGroup.logGroupArn, `${logGroup.logGroupArn}:*`],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'DynamoDbTableAccess',
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:ConditionCheckItem',
        ],
        resources: [table.tableArn],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'Gsi1Query',
        actions: ['dynamodb:Query'],
        resources: [`${table.tableArn}/index/${GSI1_NAME}`],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'SubmissionObjectsRead',
        actions: ['s3:GetObject'],
        resources: [bucket.arnForObjects('submissions/*')],
      }),
    );

    gradingQueue.grantSendMessages(this.fn);

    // Gắn routes Admin vào HTTP API với JWT Authorizer
    const integration = new HttpLambdaIntegration('AdminApiIntegration', this.fn, {
      payloadFormatVersion: apigwv2.PayloadFormatVersion.VERSION_2_0,
    });

    const addAdminRoute = (method: apigwv2.HttpMethod, path: string) =>
      api.addRoutes({
        path,
        methods: [method],
        integration,
        authorizer,
      })[0];

    // Các routes đợt chấm & nhóm
    addAdminRoute(apigwv2.HttpMethod.POST, '/api/assignments');
    addAdminRoute(apigwv2.HttpMethod.PATCH, '/api/assignments/{assignmentId}/status');
    addAdminRoute(apigwv2.HttpMethod.GET, '/api/assignments/{assignmentId}/teams');
    addAdminRoute(apigwv2.HttpMethod.GET, '/api/teams/{teamId}');
    addAdminRoute(apigwv2.HttpMethod.PATCH, '/api/teams/{teamId}/unlock');
    addAdminRoute(apigwv2.HttpMethod.GET, '/api/teams/{teamId}/files');
    addAdminRoute(apigwv2.HttpMethod.GET, '/api/assignments/{assignmentId}/export-data');

    // Các routes chấm bài & review
    addAdminRoute(apigwv2.HttpMethod.POST, '/api/teams/{teamId}/grading');
    addAdminRoute(apigwv2.HttpMethod.POST, '/api/assignments/{assignmentId}/grading');
    addAdminRoute(apigwv2.HttpMethod.GET, '/api/teams/{teamId}/grading/history');
    addAdminRoute(
      apigwv2.HttpMethod.PATCH,
      '/api/teams/{teamId}/grading/{gradingAttemptId}/review',
    );

    // Các routes Rubric & GradingConfig
    addAdminRoute(apigwv2.HttpMethod.GET, '/api/rubrics');
    addAdminRoute(apigwv2.HttpMethod.GET, '/api/rubrics/active');
    addAdminRoute(apigwv2.HttpMethod.POST, '/api/rubrics');
    addAdminRoute(apigwv2.HttpMethod.GET, '/api/grading-config');
    addAdminRoute(apigwv2.HttpMethod.GET, '/api/grading-config/active');
    addAdminRoute(apigwv2.HttpMethod.POST, '/api/grading-config');
  }
}
