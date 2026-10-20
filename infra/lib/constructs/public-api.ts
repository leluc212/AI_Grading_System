/**
 * HTTP API + Lambda `public-api` cho trang nộp bài (infra-plan mục 3, 5, 8).
 *
 * IAM least privilege (cấp tay từng action, không dùng `grantReadWrite*`):
 *   - DynamoDB: GetItem/PutItem/UpdateItem/ConditionCheckItem trên bảng;
 *     Query CHỈ trên index GSI1. Không Scan, không Query bảng gốc, không
 *     BatchGetItem, không DeleteItem.
 *   - S3: PutObject/PutObjectTagging/GetObject chỉ trên `submissions/*`
 *     (PutObjectTagging cần cho field `tagging` của presigned POST và cho
 *     finalize). Không ListBucket -> HeadObject object thiếu trả 403, code
 *     finalize coi 403 như "chưa upload".
 *   - Logs: chỉ CreateLogStream/PutLogEvents trên log group riêng.
 *   - Không ssm/sqs/kms: Phase 1 không đọc OpenAI key, không đẩy hàng đợi.
 *
 * Property 6 (public-api không đọc được kết quả chấm): IAM không lọc được
 * theo SK, nên bảo đảm bằng (1) không có Scan/Query bảng gốc/BatchGet nên
 * không liệt kê được item `GRADING#` (chúng không có khoá GSI1), và (2) code
 * chỉ dựng được khoá ASSIGNMENT/TEAMNAME/TEAM META/SUBMISSION/UPLOAD
 * (`services/api/src/domain/keys.ts`, có unit test).
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
import { Construct } from 'constructs';
import type { StackConfig } from '../config.js';
import { GSI1_NAME } from './database.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ENTRY = fileURLToPath(
  new URL('../../../services/api/src/handlers/publicApi.ts', import.meta.url),
);
const LOCK_FILE = fileURLToPath(new URL('../../../package-lock.json', import.meta.url));

/** Throttle (infra-plan mục 3): stage 20 rps / burst 40; route nộp bài 2 / 5. */
export const STAGE_THROTTLE = { rateLimit: 20, burstLimit: 40 };
export const SUBMIT_ROUTE_THROTTLE = { rateLimit: 2, burstLimit: 5 };

export class PublicApi extends Construct {
  readonly api: apigwv2.HttpApi;
  readonly fn: nodejs.NodejsFunction;

  constructor(
    scope: Construct,
    id: string,
    props: { config: StackConfig; table: dynamodb.Table; bucket: s3.Bucket },
  ) {
    super(scope, id);
    const { config, table, bucket } = props;

    const logGroup = new logs.LogGroup(this, 'LogGroup', {
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Role tự tạo, không gắn managed policy AWSLambdaBasicExecutionRole (vốn
    // cấp logs:* trên mọi log group).
    const role = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'quick-grading public-api (least privilege)',
    });

    this.fn = new nodejs.NodejsFunction(this, 'Function', {
      entry: ENTRY,
      handler: 'handler',
      projectRoot: REPO_ROOT,
      depsLockFilePath: LOCK_FILE,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      role,
      logGroup,
      environment: {
        TABLE_NAME: table.tableName,
        BUCKET_NAME: bucket.bucketName,
        STAGE: config.stage,
      },
      bundling: {
        target: 'node22',
        minify: true,
        sourceMap: false,
        // Bundle SDK đã pin thay vì dựa vào bản có sẵn trong runtime.
        externalModules: [],
        forceDockerBundling: false,
      },
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'Logs',
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        // `logGroupArn` đã có hậu tố `:*` (bao gồm log stream).
        resources: [logGroup.logGroupArn],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        sid: 'TableItems',
        actions: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
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
        sid: 'SubmissionObjects',
        actions: ['s3:PutObject', 's3:PutObjectTagging', 's3:GetObject'],
        resources: [bucket.arnForObjects('submissions/*')],
      }),
    );

    this.api = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `QuickGrading-${config.stage}-public`,
      corsPreflight: {
        allowOrigins: config.allowedOrigins,
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['content-type'],
        maxAge: Duration.days(1),
      },
    });

    const integration = new HttpLambdaIntegration('PublicApiIntegration', this.fn, {
      payloadFormatVersion: apigwv2.PayloadFormatVersion.VERSION_2_0,
    });

    const add = (method: apigwv2.HttpMethod, path: string) =>
      this.api.addRoutes({ path, methods: [method], integration })[0];

    add(apigwv2.HttpMethod.GET, '/api/assignments');
    add(apigwv2.HttpMethod.GET, '/api/assignments/{assignmentId}');
    add(apigwv2.HttpMethod.GET, '/api/teams/check-name');
    const createRoute = add(apigwv2.HttpMethod.POST, '/api/submissions');
    const finalizeRoute = add(apigwv2.HttpMethod.POST, '/api/submissions/{submissionId}/finalize');

    const cfnStage = this.api.defaultStage?.node.defaultChild as apigwv2.CfnStage;
    // `routeSettings` là kiểu JSON thô -> phải viết đúng tên property của
    // CloudFormation (PascalCase), CDK không tự đổi tên.
    const submitThrottle = {
      ThrottlingRateLimit: SUBMIT_ROUTE_THROTTLE.rateLimit,
      ThrottlingBurstLimit: SUBMIT_ROUTE_THROTTLE.burstLimit,
    };
    cfnStage.defaultRouteSettings = {
      throttlingRateLimit: STAGE_THROTTLE.rateLimit,
      throttlingBurstLimit: STAGE_THROTTLE.burstLimit,
    };
    cfnStage.routeSettings = {
      'POST /api/submissions': submitThrottle,
      'POST /api/submissions/{submissionId}/finalize': submitThrottle,
    };
    // RouteSettings tham chiếu route key -> route phải tồn tại trước stage.
    cfnStage.node.addDependency(createRoute, finalizeRoute);
  }
}
