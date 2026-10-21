/**
 * Stack chính `QuickGrading-{stage}` — Phase 1: bucket bài nộp, bảng
 * DynamoDB, HTTP API + Lambda `public-api`, cảnh báo + budget.
 *
 * Phase 1 KHÔNG tạo SQS và không tham chiếu OpenAI key (Phase 2).
 */
import { CfnOutput, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { StackConfig } from './config.js';
import { AdminApi } from './constructs/admin-api.js';
import { Auth } from './constructs/auth.js';
import { Database } from './constructs/database.js';
import { Grading } from './constructs/grading.js';
import { Monitoring } from './constructs/monitoring.js';
import { PublicApi } from './constructs/public-api.js';
import { Storage } from './constructs/storage.js';

export interface QuickGradingStackProps extends StackProps {
  config: StackConfig;
}

export class QuickGradingStack extends Stack {
  constructor(scope: Construct, id: string, props: QuickGradingStackProps) {
    super(scope, id, props);
    const { config } = props;

    const storage = new Storage(this, 'Storage', { config });
    const database = new Database(this, 'Database', { config });
    const publicApi = new PublicApi(this, 'PublicApi', {
      config,
      table: database.table,
      bucket: storage.bucket,
    });
    const monitoring = new Monitoring(this, 'Monitoring', { config, api: publicApi.api });

    // Pipeline chấm bài AI (Phase 2)
    const grading = new Grading(this, 'Grading', {
      config,
      table: database.table,
      bucket: storage.bucket,
      alarmTopic: monitoring.topic,
    });

    // Cấp quyền cho public-api đẩy vào hàng đợi khi autoGradeOnSubmit được kích hoạt
    grading.queue.grantSendMessages(publicApi.fn);
    publicApi.fn.addEnvironment('GRADING_QUEUE_URL', grading.queue.queueUrl);

    // Xác thực Quản trị viên (Phase 3.1)
    const auth = new Auth(this, 'Auth', { config });

    // Admin API Lambda và các routes quản trị được bảo vệ bởi Cognito JWT (Phase 3.1)
    new AdminApi(this, 'AdminApi', {
      config,
      table: database.table,
      bucket: storage.bucket,
      api: publicApi.api,
      authorizer: auth.authorizer,
      gradingQueue: grading.queue,
    });

    new CfnOutput(this, 'ApiUrl', { value: publicApi.api.apiEndpoint });
    new CfnOutput(this, 'BucketName', { value: storage.bucket.bucketName });
    new CfnOutput(this, 'TableName', { value: database.table.tableName });
    new CfnOutput(this, 'GradingQueueUrl', { value: grading.queue.queueUrl });
    new CfnOutput(this, 'GradingDlqUrl', { value: grading.dlq.queueUrl });
    new CfnOutput(this, 'UserPoolId', { value: auth.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: auth.userPoolClient.userPoolClientId });

    // Tag ở cấp stack -> mọi resource hỗ trợ tag đều nhận, dùng để lọc chi phí.
    Tags.of(this).add('Project', 'QuickGrading');
    Tags.of(this).add('Stage', config.stage);
  }
}
