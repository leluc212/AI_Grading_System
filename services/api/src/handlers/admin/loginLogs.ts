/**
 * Handler quản lý Nhật ký đăng nhập (Login Audit Logs) cho Admin (Phase 3.2).
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { jsonResponse } from '../../lib/http.js';
import { listLoginLogs } from '../../repositories/loginAuditRepo.js';

export async function handleListLoginLogs(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const query = event.queryStringParameters ?? {};
  const limit = query.limit ? Number.parseInt(query.limit, 10) : 50;
  const nextToken = query.nextToken;

  const result = await listLoginLogs(Number.isNaN(limit) ? 50 : limit, nextToken);
  return jsonResponse(200, result);
}
