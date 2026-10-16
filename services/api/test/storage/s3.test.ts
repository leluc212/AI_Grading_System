import { HeadObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PENDING_TAGGING_XML,
  createSubmissionUploadPost,
  headSubmissionObject,
  setS3ClientForTest,
} from '../../src/storage/s3.js';
import { setTestEnv } from '../helpers.js';

type Condition = Record<string, string> | [string, ...unknown[]];

function decodePolicy(fields: Record<string, string>): {
  expiration: string;
  conditions: Condition[];
} {
  return JSON.parse(Buffer.from(fields.Policy, 'base64').toString('utf8'));
}

beforeAll(() => {
  setTestEnv();
});

describe('createSubmissionUploadPost (ký thật bằng credential giả)', () => {
  beforeEach(() => {
    setS3ClientForTest(
      new S3Client({
        region: 'ap-southeast-1',
        credentials: { accessKeyId: 'AKIDTEST', secretAccessKey: 'test' },
      }),
    );
  });

  afterEach(() => {
    setS3ClientForTest(undefined);
  });

  it.each([
    ['md', 'submissions/a1/t1/s1/report.md', 'text/markdown; charset=utf-8'],
    ['xml', 'submissions/a1/t1/s1/data.xml', 'application/xml'],
  ] as const)('%s: điều kiện policy khoá cứng', async (fileType, key, contentType) => {
    const before = Date.now();
    const post = await createSubmissionUploadPost({ key, fileType });
    const policy = decodePolicy(post.fields);

    expect(post.url).toContain('quick-grading-test-000000000000');
    expect(post.fields.key).toBe(key);
    expect(post.fields['Content-Type']).toBe(contentType);
    expect(post.fields.tagging).toBe(PENDING_TAGGING_XML);
    expect(PENDING_TAGGING_XML).toContain('<Key>state</Key><Value>pending</Value>');

    expect(policy.conditions).toContainEqual(['content-length-range', 1, 5_242_880]);
    expect(policy.conditions).toContainEqual(['eq', '$Content-Type', contentType]);
    expect(policy.conditions).toContainEqual(['eq', '$tagging', PENDING_TAGGING_XML]);
    expect(policy.conditions).toContainEqual({ key });
    expect(policy.conditions).toContainEqual({ bucket: 'quick-grading-test-000000000000' });
    // Không có điều kiện starts-with (key/Content-Type không bị nới lỏng).
    expect(JSON.stringify(policy.conditions)).not.toContain('starts-with');

    const expiresMs = Date.parse(policy.expiration);
    expect(expiresMs).toBeGreaterThanOrEqual(before + 595_000);
    expect(expiresMs).toBeLessThanOrEqual(Date.now() + 605_000);
  });
});

describe('headSubmissionObject', () => {
  const s3Mock = mockClient(S3Client);

  beforeEach(() => {
    s3Mock.reset();
  });

  function s3Error(name: string, status: number) {
    return new S3ServiceException({
      name,
      $fault: 'client',
      $metadata: { httpStatusCode: status },
      message: name,
    });
  }

  it('trả size/etag (bỏ dấu ")/contentType', async () => {
    s3Mock.on(HeadObjectCommand).resolves({
      ContentLength: 10,
      ETag: '"abc"',
      ContentType: 'application/xml',
    });
    await expect(headSubmissionObject('k')).resolves.toEqual({
      size: 10,
      etag: 'abc',
      contentType: 'application/xml',
    });
  });

  it('404 và 403 (không có ListBucket) -> undefined', async () => {
    s3Mock.on(HeadObjectCommand).rejects(s3Error('NotFound', 404));
    await expect(headSubmissionObject('k')).resolves.toBeUndefined();
    s3Mock.on(HeadObjectCommand).rejects(s3Error('Forbidden', 403));
    await expect(headSubmissionObject('k')).resolves.toBeUndefined();
  });

  it('lỗi khác -> ném tiếp', async () => {
    s3Mock.on(HeadObjectCommand).rejects(s3Error('InternalError', 500));
    await expect(headSubmissionObject('k')).rejects.toThrow();
  });
});
