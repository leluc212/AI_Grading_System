/**
 * Unit test cho mã Lambda (`public-api`). Chạy trên Node, AWS SDK được mock
 * bằng `aws-sdk-client-mock` nên không gọi AWS thật.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    env: {
      AWS_REGION: 'ap-southeast-1',
      AWS_DEFAULT_REGION: 'ap-southeast-1',
    },
  },
});
