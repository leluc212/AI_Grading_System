/**
 * Client OpenAI gọi Responses API chấm bài đồ án (infra-plan mục 2.3, 6.2).
 *
 * Sử dụng model gpt-6.1-sol (hoặc cấu hình), Structured Outputs với json_schema strict,
 * store: false, prompt_cache_key và phân loại lỗi rõ ràng thành RetryableError / PermanentError.
 */
import OpenAI from 'openai';
import { GRADING_OUTPUT_SCHEMA, type RawAiGradingOutput } from './outputSchema.js';
import type { GradingUsage } from '@quick-grading/shared-types';

export class RetryableError extends Error {
  readonly isRetryable = true;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'RetryableError';
    if (cause) this.cause = cause;
  }
}

export class PermanentError extends Error {
  readonly isRetryable = false;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PermanentError';
    if (cause) this.cause = cause;
  }
}

export interface CallOpenAiGraderParams {
  apiKey: string;
  model: string;
  reasoningEffort?: 'low' | 'medium';
  maxOutputTokens: number;
  systemInstructions: string;
  userMessage: string;
  cacheKey: string;
  client?: OpenAI;
}

export interface CallOpenAiGraderResult {
  raw: RawAiGradingOutput;
  usage: GradingUsage;
  model: string;
}

export function classifyOpenAiError(err: unknown): Error {
  if (err instanceof RetryableError || err instanceof PermanentError) {
    return err;
  }

  const errorObj = err as {
    status?: number;
    code?: string;
    message?: string;
    name?: string;
  };

  const status = errorObj?.status;
  const message = errorObj?.message ?? '';
  const code = errorObj?.code;
  const lowerMsg = message.toLowerCase();

  // Quota / balance issues -> Permanent
  if (
    code === 'insufficient_quota' ||
    lowerMsg.includes('quota') ||
    lowerMsg.includes('exceeded your current quota')
  ) {
    return new PermanentError(`OpenAI Quota Error: ${message}`, err);
  }

  // 401 Unauthorized -> Permanent
  if (err instanceof OpenAI.AuthenticationError || status === 401) {
    return new PermanentError(`OpenAI Auth Error (401): ${message}`, err);
  }

  // 400 Bad Request / Invalid schema -> Permanent
  if (err instanceof OpenAI.BadRequestError || status === 400) {
    return new PermanentError(`OpenAI Bad Request (400): ${message}`, err);
  }

  // 429 Rate Limit -> Retryable
  if (err instanceof OpenAI.RateLimitError || status === 429) {
    return new RetryableError(`OpenAI Rate Limit (429): ${message}`, err);
  }

  // 5xx Server Error -> Retryable
  if (err instanceof OpenAI.InternalServerError || (typeof status === 'number' && status >= 500)) {
    return new RetryableError(`OpenAI Server Error (${status}): ${message}`, err);
  }

  // Timeout or Connection Error -> Retryable
  if (
    err instanceof OpenAI.APIConnectionTimeoutError ||
    err instanceof OpenAI.APIConnectionError ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    lowerMsg.includes('timeout')
  ) {
    return new RetryableError(`OpenAI Connection/Timeout Error: ${message}`, err);
  }

  if (typeof status === 'number' && status >= 400 && status < 500) {
    return new PermanentError(`OpenAI Client Error (${status}): ${message}`, err);
  }

  return new RetryableError(`Lỗi kết nối OpenAI: ${message}`, err);
}

export async function callOpenAiGrader({
  apiKey,
  model,
  reasoningEffort,
  maxOutputTokens,
  systemInstructions,
  userMessage,
  cacheKey,
  client,
}: CallOpenAiGraderParams): Promise<CallOpenAiGraderResult> {
  const openai =
    client ??
    new OpenAI({
      apiKey,
      timeout: 50_000,
      maxRetries: 1,
    });

  try {
    const response = await openai.responses.create({
      model,
      instructions: systemInstructions,
      input: userMessage,
      store: false,
      max_output_tokens: maxOutputTokens,
      text: {
        format: {
          type: 'json_schema',
          ...GRADING_OUTPUT_SCHEMA,
        },
      },
      prompt_cache_key: cacheKey,
      ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
    });

    // Kiểm tra trạng thái incomplete do max_output_tokens
    if (response.status === 'incomplete') {
      const reason = response.incomplete_details?.reason ?? 'unknown';
      throw new PermanentError(
        `OpenAI trả về phản hồi không hoàn tất (status: incomplete, reason: ${reason})`,
      );
    }

    const outputText = response.output_text?.trim();
    if (!outputText) {
      throw new PermanentError('OpenAI không trả về nội dung đánh giá (output_text rỗng)');
    }

    let raw: RawAiGradingOutput;
    try {
      raw = JSON.parse(outputText) as RawAiGradingOutput;
    } catch (parseErr) {
      throw new PermanentError(
        `Không thể parse kết quả JSON từ OpenAI: ${parseErr instanceof Error ? parseErr.message : parseErr}`,
      );
    }

    const usage: GradingUsage = {
      inputTokens: response.usage?.input_tokens ?? 0,
      cachedInputTokens: response.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };

    return {
      raw,
      usage,
      model,
    };
  } catch (err) {
    throw classifyOpenAiError(err);
  }
}
