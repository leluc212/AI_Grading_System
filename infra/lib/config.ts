/**
 * Đọc + validate CDK context (`cdk.json` hoặc `-c key=value`).
 *
 * `alarmEmails` và `allowedOrigins` là chuỗi phân tách bằng dấu phẩy để thêm
 * địa chỉ/origin mới chỉ cần sửa context rồi deploy lại, không sửa code.
 */
import type { App } from 'aws-cdk-lib';

export interface StackConfig {
  stage: string;
  account: string;
  region: string;
  alarmEmails: string[];
  allowedOrigins: string[];
  budgetLimitUsd: number;
}

/** Giống `apps/web-submitter/src/validation.ts`. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;
const STAGE_PATTERN = /^[a-z][a-z0-9-]{0,15}$/;
const ACCOUNT_PATTERN = /^\d{12}$/;
const REGION_PATTERN = /^[a-z]{2}(-[a-z]+)+-\d$/;

/** Tách danh sách phân tách bằng dấu phẩy: trim, bỏ rỗng, bỏ trùng (giữ thứ tự). */
export function parseList(raw: unknown): string[] {
  if (raw === undefined || raw === null) {
    return [];
  }
  const text = Array.isArray(raw) ? raw.join(',') : typeof raw === 'string' ? raw : String(raw);
  const out: string[] = [];
  for (const part of text.split(',')) {
    const item = part.trim();
    if (item.length > 0 && !out.includes(item)) {
      out.push(item);
    }
  }
  return out;
}

export function parseAlarmEmails(raw: unknown): string[] {
  const emails = parseList(raw).map((e) => e.toLowerCase());
  const unique = [...new Set(emails)];
  if (unique.length === 0) {
    throw new Error('Context "alarmEmails" must contain at least one email address.');
  }
  for (const email of unique) {
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      throw new Error(`Context "alarmEmails" contains an invalid email: "${email}".`);
    }
  }
  return unique;
}

export function parseAllowedOrigins(raw: unknown): string[] {
  const origins = parseList(raw);
  if (origins.length === 0) {
    throw new Error('Context "allowedOrigins" must contain at least one origin.');
  }
  return origins.map((origin) => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`Context "allowedOrigins" contains an invalid URL: "${origin}".`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Context "allowedOrigins" only supports http/https: "${origin}".`);
    }
    if (url.pathname !== '/' || url.search !== '' || url.hash !== '' || url.username !== '') {
      throw new Error(`Context "allowedOrigins" must be a bare origin: "${origin}".`);
    }
    if (origin.endsWith('/')) {
      throw new Error(`Context "allowedOrigins" must not end with "/": "${origin}".`);
    }
    return url.origin;
  });
}

export function buildStackConfig(ctx: (key: string) => unknown): StackConfig {
  const rawStage = ctx('stage');
  const stage = typeof rawStage === 'string' ? rawStage : '';
  if (!STAGE_PATTERN.test(stage)) {
    throw new Error(`Context "stage" is invalid: "${stage}".`);
  }
  const rawAccount = ctx('account');
  const account = typeof rawAccount === 'string' ? rawAccount : '';
  if (!ACCOUNT_PATTERN.test(account)) {
    throw new Error(`Context "account" is invalid: "${account}".`);
  }
  const rawRegion = ctx('region');
  const region = typeof rawRegion === 'string' ? rawRegion : '';
  if (!REGION_PATTERN.test(region)) {
    throw new Error(`Context "region" is invalid: "${region}".`);
  }
  const budgetLimitUsd = Number(ctx('budgetLimitUsd') ?? 10);
  if (!Number.isFinite(budgetLimitUsd) || budgetLimitUsd <= 0) {
    throw new Error('Context "budgetLimitUsd" must be a positive number.');
  }
  return {
    stage,
    account,
    region,
    alarmEmails: parseAlarmEmails(ctx('alarmEmails')),
    allowedOrigins: parseAllowedOrigins(ctx('allowedOrigins')),
    budgetLimitUsd,
  };
}

export function readStackConfig(app: App): StackConfig {
  return buildStackConfig((key) => app.node.tryGetContext(key));
}
