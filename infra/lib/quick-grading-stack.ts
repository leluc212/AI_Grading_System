/**
 * Stack chính `QuickGrading-{stage}` — Phase 1: bucket bài nộp, bảng
 * DynamoDB, HTTP API + Lambda `public-api`, cảnh báo + budget.
 *
 * Phase 1 KHÔNG tạo SQS và không tham chiếu OpenAI key (Phase 2).
 */
import { CfnOutput, Stack, Tags, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { StackConfig } from './config.js';
import { Database } from './constructs/database.js';
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
    new Monitoring(this, 'Monitoring', { config, api: publicApi.api });

    new CfnOutput(this, 'ApiUrl', { value: publicApi.api.apiEndpoint });
    new CfnOutput(this, 'BucketName', { value: storage.bucket.bucketName });
    new CfnOutput(this, 'TableName', { value: database.table.tableName });

    // Tag ở cấp stack -> mọi resource hỗ trợ tag đều nhận, dùng để lọc chi phí.
    Tags.of(this).add('Project', 'QuickGrading');
    Tags.of(this).add('Stage', config.stage);
  }
}
