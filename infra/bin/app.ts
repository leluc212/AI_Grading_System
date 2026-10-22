/**
 * CDK app của Quick Grading. Stage lấy từ context (`-c stage=dev`), mặc định
 * `dev` trong `cdk.json`. Stack tên `QuickGrading-{stage}`.
 */
import { App } from 'aws-cdk-lib';
import { readStackConfig } from '../lib/config.js';
import { QuickGradingStack } from '../lib/quick-grading-stack.js';

const app = new App();
const config = readStackConfig(app);

export const stack = new QuickGradingStack(app, `QuickGrading-${config.stage}`, {
  env: { account: config.account, region: config.region },
  config,
});
