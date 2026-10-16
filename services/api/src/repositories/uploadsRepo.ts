/**
 * Phiên upload (giữa `POST /api/submissions` và finalize). Hết hạn sau 1 giờ
 * qua TTL; TTL của DynamoDB xoá trễ nên lúc đọc vẫn tự kiểm tra `ttl`.
 */
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { FileType } from '@quick-grading/shared-types';
import { UPLOAD_SESSION_TTL_SECONDS } from '@quick-grading/shared-types';
import { uploadKey } from '../domain/keys.js';
import { ddb, tableName } from './ddb.js';

export interface SessionFileMeta {
  fileName: string;
  size: number;
  s3Key: string;
}

export interface SessionMember {
  memberName: string;
  email: string;
  studentCode?: string;
}

export interface UploadSession {
  submissionId: string;
  assignmentId: string;
  teamId: string;
  existingTeam: boolean;
  teamName: string;
  teamNameNormalized: string;
  members: SessionMember[];
  files: Record<FileType, SessionFileMeta>;
  createdAt: string;
}

export async function putUploadSession(session: UploadSession, nowMs = Date.now()): Promise<void> {
  await ddb().send(
    new PutCommand({
      TableName: tableName(),
      Item: {
        ...uploadKey(session.submissionId),
        ...session,
        state: 'PENDING',
        ttl: Math.floor(nowMs / 1000) + UPLOAD_SESSION_TTL_SECONDS,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
}

function toFileMeta(value: unknown): SessionFileMeta {
  const f = (value ?? {}) as Record<string, unknown>;
  return { fileName: String(f.fileName), size: Number(f.size), s3Key: String(f.s3Key) };
}

/** Trả phiên còn PENDING và chưa hết hạn; ngược lại `undefined`. */
export async function getPendingUploadSession(
  submissionId: string,
  nowMs = Date.now(),
): Promise<UploadSession | undefined> {
  const result = await ddb().send(
    new GetCommand({ TableName: tableName(), Key: uploadKey(submissionId), ConsistentRead: true }),
  );
  const item = result.Item;
  if (item === undefined || item.state !== 'PENDING') {
    return undefined;
  }
  if (typeof item.ttl !== 'number' || item.ttl <= Math.floor(nowMs / 1000)) {
    return undefined;
  }
  const files = (item.files ?? {}) as Record<string, unknown>;
  return {
    submissionId: String(item.submissionId),
    assignmentId: String(item.assignmentId),
    teamId: String(item.teamId),
    existingTeam: item.existingTeam === true,
    teamName: String(item.teamName),
    teamNameNormalized: String(item.teamNameNormalized),
    members: Array.isArray(item.members)
      ? item.members.map((m: Record<string, unknown>) => {
          const member: SessionMember = {
            memberName: String(m.memberName),
            email: String(m.email),
          };
          if (typeof m.studentCode === 'string') {
            member.studentCode = m.studentCode;
          }
          return member;
        })
      : [],
    files: { md: toFileMeta(files.md), xml: toFileMeta(files.xml) },
    createdAt: String(item.createdAt),
  };
}
