/**
 * S3 cho bài nộp: presigned POST (browser upload thẳng lên S3, không qua
 * Lambda), HeadObject, đọc 1KB đầu, gắn tag `state=final`.
 *
 * Presigned POST khoá cứng (infra-plan mục 8): đúng `key`, `Content-Type` cố
 * định, `content-length-range` 1..5MB, tag `state=pending` (lifecycle xoá
 * sau 1 ngày nếu không finalize), hết hạn 10 phút.
 */
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { FileType, PresignedPost } from '@quick-grading/shared-types';
import {
  MAX_MD_FILE_SIZE_BYTES,
  MAX_XML_FILE_SIZE_BYTES,
  MIN_FILE_SIZE_BYTES,
  PRESIGNED_POST_EXPIRES_SECONDS,
} from '@quick-grading/shared-types';
import { SUBMISSION_CONTENT_TYPES } from '../domain/keys.js';
import { readEnv } from '../lib/env.js';

export const PENDING_TAGGING_XML =
  '<Tagging><TagSet><Tag><Key>state</Key><Value>pending</Value></Tag></TagSet></Tagging>';

let client: S3Client | undefined;

export function s3(): S3Client {
  if (client === undefined) {
    client = new S3Client({
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'ap-southeast-1',
    });
  }
  return client;
}

/** Cho test: dùng client với credential giả để ký presigned POST thật. */
export function setS3ClientForTest(value: S3Client | undefined): void {
  client = value;
}

function bucketName(): string {
  return readEnv().bucketName;
}

export async function createSubmissionUploadPost(params: {
  key: string;
  fileType: FileType;
}): Promise<PresignedPost> {
  const contentType = SUBMISSION_CONTENT_TYPES[params.fileType];
  const { url, fields } = await createPresignedPost(s3(), {
    Bucket: bucketName(),
    Key: params.key,
    Conditions: [
      [
        'content-length-range',
        MIN_FILE_SIZE_BYTES,
        params.fileType === 'md' ? MAX_MD_FILE_SIZE_BYTES : MAX_XML_FILE_SIZE_BYTES,
      ],
      ['eq', '$Content-Type', contentType],
      ['eq', '$tagging', PENDING_TAGGING_XML],
    ],
    Fields: {
      'Content-Type': contentType,
      tagging: PENDING_TAGGING_XML,
    },
    Expires: PRESIGNED_POST_EXPIRES_SECONDS,
  });
  return { url, fields };
}

function isMissingObjectError(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  const status = e?.$metadata?.httpStatusCode;
  // Không có s3:ListBucket nên object không tồn tại có thể trả 403 thay vì 404.
  return (
    e?.name === 'NotFound' ||
    e?.name === 'NoSuchKey' ||
    e?.name === 'Forbidden' ||
    e?.name === 'AccessDenied' ||
    status === 404 ||
    status === 403
  );
}

export interface ObjectHead {
  size: number;
  etag: string;
  contentType: string;
}

export async function headSubmissionObject(key: string): Promise<ObjectHead | undefined> {
  try {
    const result = await s3().send(new HeadObjectCommand({ Bucket: bucketName(), Key: key }));
    return {
      size: result.ContentLength ?? 0,
      etag: (result.ETag ?? '').replaceAll('"', ''),
      contentType: result.ContentType ?? '',
    };
  } catch (err) {
    if (isMissingObjectError(err)) {
      return undefined;
    }
    throw err;
  }
}

/** Đọc tối đa `maxBytes` byte đầu của object (Range GET). */
export async function readObjectHead(key: string, maxBytes = 1024): Promise<Uint8Array> {
  const result = await s3().send(
    new GetObjectCommand({ Bucket: bucketName(), Key: key, Range: `bytes=0-${maxBytes - 1}` }),
  );
  if (result.Body === undefined) {
    return new Uint8Array();
  }
  const bytes = await result.Body.transformToByteArray();
  return bytes.subarray(0, maxBytes);
}

/** Thay tag set bằng `state=final` để lifecycle không xoá bài đã nộp. */
export async function markObjectFinal(key: string): Promise<void> {
  await s3().send(
    new PutObjectTaggingCommand({
      Bucket: bucketName(),
      Key: key,
      Tagging: { TagSet: [{ Key: 'state', Value: 'final' }] },
    }),
  );
}

/** Đọc toàn bộ nội dung text UTF-8 của object từ S3 (dùng cho worker chấm bài). */
export async function readObjectText(key: string): Promise<string> {
  const result = await s3().send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
  if (result.Body === undefined) {
    return '';
  }
  return await result.Body.transformToString('utf-8');
}

/** Sinh Presigned GET URL hết hạn sau expiresIn giây (mặc định 300s = 5 phút). */
export async function createPresignedGetUrl(key: string, expiresIn = 300): Promise<string> {
  const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucketName(), Key: key }), {
    expiresIn,
  });
}
