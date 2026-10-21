import { describe, it, expect, vi } from 'vitest';
import OpenAI from 'openai';
import {
  callOpenAiGrader,
  RetryableError,
  PermanentError,
  classifyOpenAiError,
} from '../../src/grading/openaiGrader.js';

describe('openaiGrader', () => {
  const fakeParams = {
    apiKey: 'sk-test',
    model: 'gpt-6.1-sol',
    maxOutputTokens: 2000,
    systemInstructions: 'System prompt',
    userMessage: 'User input',
    cacheKey: 'test-cache-key',
  };

  it('thành công trả về raw output và usage (gồm cached tokens)', async () => {
    const fakeRaw = {
      criteria: [{ criterionId: 'c1', score: 85, comment: 'Tốt' }],
      totalScore: 85,
      feedback: 'Bài làm tốt',
      needsReview: false,
      needsReviewReason: '',
      confidence: 0.95,
    };

    const mockClient = {
      responses: {
        create: vi.fn().mockResolvedValue({
          id: 'resp_123',
          status: 'completed',
          output_text: JSON.stringify(fakeRaw),
          usage: {
            input_tokens: 1500,
            input_tokens_details: {
              cached_tokens: 1024,
            },
            output_tokens: 300,
          },
        }),
      },
    } as unknown as OpenAI;

    const result = await callOpenAiGrader({
      ...fakeParams,
      client: mockClient,
    });

    expect(result.model).toBe('gpt-6.1-sol');
    expect(result.raw).toEqual(fakeRaw);
    expect(result.usage.inputTokens).toBe(1500);
    expect(result.usage.cachedInputTokens).toBe(1024);
    expect(result.usage.outputTokens).toBe(300);
  });

  it('lỗi 429 RateLimitError được phân loại thành RetryableError', () => {
    const rateLimitErr = new OpenAI.RateLimitError(
      429,
      { error: { message: 'Rate limit reached' } },
      'Rate limit reached',
      new Headers(),
    );
    const classified = classifyOpenAiError(rateLimitErr);
    expect(classified).toBeInstanceOf(RetryableError);
  });

  it('lỗi 500/503 InternalServerError được phân loại thành RetryableError', () => {
    const serverErr = new OpenAI.InternalServerError(
      500,
      { error: { message: 'Server error' } },
      'Server error',
      new Headers(),
    );
    const classified = classifyOpenAiError(serverErr);
    expect(classified).toBeInstanceOf(RetryableError);
  });

  it('lỗi Timeout / Connection Error được phân loại thành RetryableError', () => {
    const timeoutErr = new OpenAI.APIConnectionTimeoutError({ message: 'Request timed out' });
    const classified = classifyOpenAiError(timeoutErr);
    expect(classified).toBeInstanceOf(RetryableError);
  });

  it('lỗi 401 AuthenticationError được phân loại thành PermanentError', () => {
    const authErr = new OpenAI.AuthenticationError(
      401,
      { error: { message: 'Invalid API key' } },
      'Invalid API key',
      new Headers(),
    );
    const classified = classifyOpenAiError(authErr);
    expect(classified).toBeInstanceOf(PermanentError);
  });

  it('lỗi 400 BadRequestError được phân loại thành PermanentError', () => {
    const badReqErr = new OpenAI.BadRequestError(
      400,
      { error: { message: 'Invalid schema' } },
      'Invalid schema',
      new Headers(),
    );
    const classified = classifyOpenAiError(badReqErr);
    expect(classified).toBeInstanceOf(PermanentError);
  });

  it('lỗi quota (insufficient_quota) được phân loại thành PermanentError', () => {
    const quotaErr = {
      status: 429,
      code: 'insufficient_quota',
      message: 'You exceeded your current quota',
    };
    const classified = classifyOpenAiError(quotaErr);
    expect(classified).toBeInstanceOf(PermanentError);
  });

  it('kết quả incomplete do max_output_tokens ném ra PermanentError', async () => {
    const mockClient = {
      responses: {
        create: vi.fn().mockResolvedValue({
          id: 'resp_incomplete',
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          output_text: '{"partial": true',
        }),
      },
    } as unknown as OpenAI;

    await expect(
      callOpenAiGrader({
        ...fakeParams,
        client: mockClient,
      }),
    ).rejects.toThrowError(PermanentError);
  });

  it('kết quả không parse được JSON ném ra PermanentError', async () => {
    const mockClient = {
      responses: {
        create: vi.fn().mockResolvedValue({
          id: 'resp_corrupt',
          status: 'completed',
          output_text: 'NOT_A_JSON',
        }),
      },
    } as unknown as OpenAI;

    await expect(
      callOpenAiGrader({
        ...fakeParams,
        client: mockClient,
      }),
    ).rejects.toThrowError(PermanentError);
  });
});
