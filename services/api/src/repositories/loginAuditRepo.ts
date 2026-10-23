/**
 * Repository quản lý Nhật ký đăng nhập (Login Audit Logs) của sinh viên.
 */
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { ListLoginLogsResponse, LoginAuditLog } from '@quick-grading/shared-types';
import { LOGIN_LOGS_GSI1PK, loginLogKey } from '../domain/keys.js';
import { ddb, tableName } from './ddb.js';

const GSI1_NAME = 'GSI1';

export async function recordLoginLog(log: LoginAuditLog): Promise<void> {
  const key = loginLogKey(log.logId);
  await ddb().send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        PK: key.PK,
        SK: key.SK,
        GSI1PK: LOGIN_LOGS_GSI1PK,
        GSI1SK: `${log.timestamp}#${log.logId}`,
        logId: log.logId,
        userSub: log.userSub,
        email: log.email,
        name: log.name,
        provider: log.provider,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        timestamp: log.timestamp,
        status: log.status,
      },
    }),
  );
}

export async function listLoginLogs(
  limit = 50,
  nextToken?: string,
): Promise<ListLoginLogsResponse> {
  let exclusiveStartKey: Record<string, unknown> | undefined = undefined;
  if (nextToken) {
    try {
      exclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString('utf-8'));
    } catch {
      // Bỏ qua token không hợp lệ
    }
  }

  const result = await ddb().send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: GSI1_NAME,
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: {
        ':pk': LOGIN_LOGS_GSI1PK,
      },
      ScanIndexForward: false, // Mới nhất lên đầu
      Limit: Math.min(limit, 100),
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );

  const items: LoginAuditLog[] = (result.Items ?? []).map((item) => ({
    logId: String(item.logId ?? ''),
    userSub: String(item.userSub ?? ''),
    email: String(item.email ?? ''),
    name: String(item.name ?? ''),
    provider: String(item.provider ?? 'Google'),
    ipAddress: String(item.ipAddress ?? ''),
    userAgent: String(item.userAgent ?? ''),
    timestamp: String(item.timestamp ?? ''),
    status: item.status === 'FAILED' ? 'FAILED' : 'SUCCESS',
  }));

  let newNextToken: string | undefined = undefined;
  if (result.LastEvaluatedKey) {
    newNextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
  }

  return { items, nextToken: newNextToken };
}
