import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '@quick-grading/shared-types';
import { jsonResponse } from '../../src/lib/http.js';
import { createRouter, parseJsonBody } from '../../src/lib/router.js';

function event(partial: Partial<APIGatewayProxyEventV2>): APIGatewayProxyEventV2 {
  return { routeKey: 'POST /x', isBase64Encoded: false, ...partial } as APIGatewayProxyEventV2;
}

describe('parseJsonBody', () => {
  it('JSON thường và base64', () => {
    expect(parseJsonBody(event({ body: '{"a":1}' }))).toEqual({ a: 1 });
    expect(
      parseJsonBody(
        event({ body: Buffer.from('{"a":"ồ"}').toString('base64'), isBase64Encoded: true }),
      ),
    ).toEqual({ a: 'ồ' });
  });

  it('body 65_537 byte -> ValidationError, 65_536 byte vẫn nhận', () => {
    const ok = JSON.stringify({ a: 'x'.repeat(65_536 - 8) });
    expect(Buffer.byteLength(ok)).toBe(65_536);
    expect(() => parseJsonBody(event({ body: ok }))).not.toThrow();
    const tooBig = JSON.stringify({ a: 'x'.repeat(65_536 - 7) });
    expect(() => parseJsonBody(event({ body: tooBig }))).toThrow(ValidationError);
    expect(() =>
      parseJsonBody(event({ body: Buffer.from(tooBig).toString('base64'), isBase64Encoded: true })),
    ).toThrow(ValidationError);
  });

  it('tính theo byte, không theo ký tự (UTF-8 nhiều byte)', () => {
    const body = JSON.stringify({ a: 'ồ'.repeat(30_000) });
    expect(body.length).toBeLessThan(65_536);
    expect(() => parseJsonBody(event({ body }))).toThrow(ValidationError);
  });

  it('JSON sai / rỗng -> ValidationError', () => {
    expect(() => parseJsonBody(event({ body: '{bad' }))).toThrow(ValidationError);
    expect(() => parseJsonBody(event({ body: undefined }))).toThrow(ValidationError);
  });
});

describe('createRouter', () => {
  it('dispatch theo routeKey, route lạ -> NotFoundError', async () => {
    const router = createRouter({ 'GET /a': async () => jsonResponse(200, { ok: true }) });
    await expect(router(event({ routeKey: 'GET /a' }))).resolves.toMatchObject({ statusCode: 200 });
    await expect(router(event({ routeKey: 'GET /b' }))).rejects.toBeInstanceOf(NotFoundError);
    await expect(router(event({ routeKey: 'constructor' }))).rejects.toBeInstanceOf(NotFoundError);
  });
});
