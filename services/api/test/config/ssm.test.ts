import { describe, it, expect, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import {
  getOpenAiApiKey,
  getOpenAiModel,
  _resetSsmCacheForTesting,
  _setSsmClientForTesting,
} from '../../src/config/ssm.js';

describe('ssm config', () => {
  const ssmMock = mockClient(SSMClient);

  beforeEach(() => {
    ssmMock.reset();
    _resetSsmCacheForTesting();
    _setSsmClientForTesting(undefined);
    process.env.STAGE = 'dev';
    process.env.TABLE_NAME = 'QuickGrading-dev';
    process.env.BUCKET_NAME = 'quick-grading-dev-test';
  });

  it('lấy API Key từ SSM Parameter và cache ở các lần gọi sau', async () => {
    ssmMock
      .on(GetParameterCommand, {
        Name: '/quick-grading/dev/openai/api-key',
        WithDecryption: true,
      })
      .resolves({
        Parameter: { Value: 'sk-test-secret-key-12345' },
      });

    const key1 = await getOpenAiApiKey();
    expect(key1).toBe('sk-test-secret-key-12345');
    expect(ssmMock.calls()).toHaveLength(1);

    // Lần gọi thứ 2 phải đọc từ cache (không gọi SSM nữa)
    const key2 = await getOpenAiApiKey();
    expect(key2).toBe('sk-test-secret-key-12345');
    expect(ssmMock.calls()).toHaveLength(1);
  });

  it('quăng lỗi nếu parameter API Key rỗng hoặc không tìm thấy', async () => {
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: { Value: '' },
    });

    await expect(getOpenAiApiKey()).rejects.toThrowError(/Không tìm thấy giá trị API Key/);
  });

  it('lấy model từ SSM nếu có, và fallback sang gpt-6.1-sol nếu không tìm thấy', async () => {
    // Trường hợp có parameter riêng
    ssmMock
      .on(GetParameterCommand, {
        Name: '/quick-grading/dev/openai/model',
      })
      .resolves({
        Parameter: { Value: 'custom-model-abc' },
      });

    const model1 = await getOpenAiModel();
    expect(model1).toBe('custom-model-abc');

    _resetSsmCacheForTesting();
    ssmMock.reset();

    // Trường hợp không có parameter riêng -> fallback gpt-6.1-sol
    ssmMock.on(GetParameterCommand).rejects(new Error('ParameterNotFound'));
    const model2 = await getOpenAiModel();
    expect(model2).toBe('gpt-6.1-sol');
  });
});
