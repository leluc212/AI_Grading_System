/**
 * Bảng single-table `QuickGrading-{stage}` (infra-plan mục 4.1): on-demand,
 * GSI1 (projection ALL), TTL `ttl` cho phiên upload, PITR bật, mã hoá mặc
 * định (AWS owned key, không tốn phí KMS).
 */
import { RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import type { StackConfig } from '../config.js';

export const GSI1_NAME = 'GSI1';

export class Database extends Construct {
  readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: { config: StackConfig }) {
    super(scope, id);
    const { config } = props;

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: `QuickGrading-${config.stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: config.stage === 'prod' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: GSI1_NAME,
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
  }
}
