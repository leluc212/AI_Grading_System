/**
 * Dựng response HTTP API (payload v2). Lỗi luôn có shape `{ code, message }`;
 * lỗi không lường trước trả 500 với thông báo chung, không lộ stack/chi tiết.
 */
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { DomainError } from '@quick-grading/shared-types';
import { log } from './logger.js';

export const SECURITY_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
} as const;

export const INTERNAL_ERROR_MESSAGE = 'Lỗi hệ thống, vui lòng thử lại sau.';

export function jsonResponse(status: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode: status,
    headers: { ...SECURITY_HEADERS },
    body: JSON.stringify(body),
  };
}

export interface ErrorContext {
  requestId?: string;
  routeKey?: string;
}

export function errorResponse(
  err: unknown,
  ctx: ErrorContext = {},
): APIGatewayProxyStructuredResultV2 {
  if (err instanceof DomainError) {
    return jsonResponse(err.httpStatus, { code: err.code, message: err.message });
  }
  // Chỉ log tên lỗi (không log message: có thể chứa dữ liệu request).
  log('error', 'unhandled error', {
    ...ctx,
    errorName: err instanceof Error ? err.name : typeof err,
  });
  return jsonResponse(500, { code: 'INTERNAL_ERROR', message: INTERNAL_ERROR_MESSAGE });
}
