import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
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

describe('QuickGradingStack', () => {
  it('synth được', () => {
    expect(synth().toJSON()).toBeDefined();
  });
});
