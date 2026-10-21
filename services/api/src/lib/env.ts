/**
 * Đọc cấu hình runtime của Lambda từ biến môi trường (do CDK set).
 * Thiếu biến nào thì throw ngay để lỗi cấu hình lộ ra sớm thay vì ghi nhầm chỗ.
 */
export interface RuntimeEnv {
  tableName: string;
  bucketName: string;
  stage: string;
  gradingQueueUrl?: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function readEnv(): RuntimeEnv {
  return {
    tableName: required('TABLE_NAME'),
    bucketName: required('BUCKET_NAME'),
    stage: required('STAGE'),
    gradingQueueUrl: process.env.GRADING_QUEUE_URL,
  };
}
