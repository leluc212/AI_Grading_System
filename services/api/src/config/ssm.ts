/**
 * Đọc cấu hình bí mật từ AWS SSM Parameter Store (infra-plan mục 1 D9, mục 2.3).
 *
 * Cache ở mức module variable để tái sử dụng trong các lần warm invocation của Lambda.
 */
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { readEnv } from '../lib/env.js';

let cachedApiKey: string | undefined;
let cachedModel: string | undefined;

let ssmClient: SSMClient | undefined;

function getSsmClient(): SSMClient {
  if (!ssmClient) {
    ssmClient = new SSMClient({ region: process.env.AWS_REGION ?? 'ap-southeast-1' });
  }
  return ssmClient;
}

export function _setSsmClientForTesting(client: SSMClient | undefined): void {
  ssmClient = client;
}

export function _resetSsmCacheForTesting(): void {
  cachedApiKey = undefined;
  cachedModel = undefined;
}

/**
 * Lấy OpenAI API Key từ SSM Parameter Store.
 * Parameter name: `/quick-grading/{stage}/openai/api-key` (SecureString).
 */
export async function getOpenAiApiKey(): Promise<string> {
  if (cachedApiKey) {
    return cachedApiKey;
  }

  const { stage } = readEnv();
  const paramName = `/quick-grading/${stage}/openai/api-key`;

  const client = getSsmClient();
  const res = await client.send(
    new GetParameterCommand({
      Name: paramName,
      WithDecryption: true,
    }),
  );

  const key = res.Parameter?.Value?.trim();
  if (!key) {
    throw new Error(`Không tìm thấy giá trị API Key trong SSM parameter: ${paramName}`);
  }

  cachedApiKey = key;
  return cachedApiKey;
}

/**
 * Lấy model OpenAI mặc định từ SSM (nếu có cấu hình riêng), fallback sang 'gpt-6.1-sol'.
 * Parameter name: `/quick-grading/{stage}/openai/model` (String).
 */
export async function getOpenAiModel(): Promise<string> {
  if (cachedModel) {
    return cachedModel;
  }

  const { stage } = readEnv();
  const paramName = `/quick-grading/${stage}/openai/model`;

  try {
    const client = getSsmClient();
    const res = await client.send(
      new GetParameterCommand({
        Name: paramName,
      }),
    );
    const model = res.Parameter?.Value?.trim();
    if (model) {
      cachedModel = model;
      return cachedModel;
    }
  } catch {
    // Không có parameter model cấu hình riêng thì dùng fallback mặc định
  }

  cachedModel = 'gpt-6.1-sol';
  return cachedModel;
}
