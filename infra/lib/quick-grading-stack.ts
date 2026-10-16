/**
 * Stack chính `QuickGrading-{stage}`.
 */
import { Stack, Tags, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import type { StackConfig } from './config.js';

export interface QuickGradingStackProps extends StackProps {
  config: StackConfig;
}

export class QuickGradingStack extends Stack {
  constructor(scope: Construct, id: string, props: QuickGradingStackProps) {
    super(scope, id, props);
    const { config } = props;

    // Tag ở cấp stack -> mọi resource hỗ trợ tag đều nhận, dùng để lọc chi phí.
    Tags.of(this).add('Project', 'QuickGrading');
    Tags.of(this).add('Stage', config.stage);
  }
}
