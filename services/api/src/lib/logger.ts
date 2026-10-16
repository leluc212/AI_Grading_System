/**
 * Logger JSON 1 dòng / sự kiện, CHỈ ghi các field nằm trong allowlist (id,
 * trạng thái, tên lỗi). Mọi field khác bị bỏ, nên dù caller lỡ truyền
 * `teamName`, email, body request hay presigned fields thì cũng không lọt vào
 * CloudWatch (infra-plan mục 8: log chỉ chứa id, không PII/secret).
 */
export type LogLevel = 'info' | 'warn' | 'error';

const ALLOWED_FIELDS = new Set([
  'requestId',
  'routeKey',
  'assignmentId',
  'teamId',
  'submissionId',
  'status',
  'errorName',
  'errorCode',
  'durationMs',
  's3ErrorName',
]);

/** Giá trị được phép: chuỗi ngắn hoặc số/boolean. Chuỗi dài bị cắt. */
function sanitizeValue(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value.length > 200 ? value.slice(0, 200) : value;
  }
  return undefined;
}

export function sanitizeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(key)) {
      continue;
    }
    const clean = sanitizeValue(value);
    if (clean !== undefined) {
      out[key] = clean;
    }
  }
  return out;
}

export function log(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...sanitizeFields(fields),
  });
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}
