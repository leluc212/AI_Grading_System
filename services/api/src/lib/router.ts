/**
 * Router tối giản theo `event.routeKey` (HTTP API payload v2). API Gateway đã
 * match route; ở đây chỉ dispatch, nên route không khai báo -> 404.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { MAX_JSON_BODY_BYTES, NotFoundError, ValidationError } from '@quick-grading/shared-types';

export type RouteHandler = (
  event: APIGatewayProxyEventV2,
) => Promise<APIGatewayProxyStructuredResultV2>;

export function createRouter(routes: Record<string, RouteHandler>): RouteHandler {
  return async (event) => {
    const handler = Object.prototype.hasOwnProperty.call(routes, event.routeKey)
      ? routes[event.routeKey]
      : undefined;
    if (handler === undefined) {
      throw new NotFoundError('Route', event.routeKey, 'Không tìm thấy đường dẫn yêu cầu.');
    }
    return handler(event);
  };
}

/** Decode + parse body JSON, giới hạn 64KB (tính theo byte sau khi decode). */
export function parseJsonBody(event: APIGatewayProxyEventV2): unknown {
  const raw = event.body ?? '';
  // Chặn sớm trước khi decode: base64 dài hơn ~4/3 lần dữ liệu gốc.
  if (raw.length > Math.ceil((MAX_JSON_BODY_BYTES * 4) / 3) + 4) {
    throw new ValidationError('Dữ liệu gửi lên quá lớn.');
  }
  const bytes = event.isBase64Encoded ? Buffer.from(raw, 'base64') : Buffer.from(raw, 'utf8');
  if (bytes.byteLength > MAX_JSON_BODY_BYTES) {
    throw new ValidationError('Dữ liệu gửi lên quá lớn.');
  }
  if (bytes.byteLength === 0) {
    throw new ValidationError('Thiếu dữ liệu gửi lên.');
  }
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new ValidationError('Dữ liệu gửi lên không đúng định dạng JSON.');
  }
}
