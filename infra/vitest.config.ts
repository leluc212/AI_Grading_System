/**
 * Test CDK bằng `aws-cdk-lib/assertions`. Synth stack mất vài giây nên nới
 * timeout; bundling Lambda được tắt trong test (context
 * `aws:cdk:bundling-stacks: []`) để không cần chạy esbuild.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 60000,
  },
});
