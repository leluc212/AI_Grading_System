/**
 * Đọc Assignment (chỉ đọc ở Phase 1; tạo/đổi trạng thái là API Admin Phase 3).
 */
import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Assignment, AssignmentListItem, AssignmentStatus } from '@quick-grading/shared-types';
import { NotFoundError } from '@quick-grading/shared-types';
import { ASSIGNMENTS_GSI1PK, assignmentKey } from '../domain/keys.js';
import { ddb, tableName } from './ddb.js';

const MAX_LIST_ITEMS = 1000;

function toStatus(value: unknown): AssignmentStatus {
  return value === 'OPEN' ? 'OPEN' : 'CLOSED';
}

function toStringValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

/** Chỉ copy field công khai, không trả PK/SK/GSI ra ngoài. */
export function toListItem(item: Record<string, unknown>): AssignmentListItem {
  return {
    assignmentId: toStringValue(item.assignmentId),
    assignmentName: toStringValue(item.assignmentName),
    status: toStatus(item.status),
    createdAt: toStringValue(item.createdAt),
    createdBy: toStringValue(item.createdBy),
    submittedTeamCount: typeof item.submittedTeamCount === 'number' ? item.submittedTeamCount : 0,
  };
}

export function toAssignment(item: AssignmentListItem): Assignment {
  return {
    assignmentId: item.assignmentId,
    assignmentName: item.assignmentName,
    status: item.status,
    createdAt: item.createdAt,
    createdBy: item.createdBy,
  };
}

export async function getAssignment(assignmentId: string): Promise<AssignmentListItem | undefined> {
  const result = await ddb().send(
    new GetCommand({ TableName: tableName(), Key: assignmentKey(assignmentId) }),
  );
  return result.Item === undefined ? undefined : toListItem(result.Item);
}

async function queryAssignmentPage(
  exclusiveStartKey?: Record<string, unknown>,
): Promise<{ items: AssignmentListItem[]; nextKey?: Record<string, unknown> }> {
  const result = await ddb().send(
    new QueryCommand({
      TableName: tableName(),
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': ASSIGNMENTS_GSI1PK },
      ScanIndexForward: true,
      ExclusiveStartKey: exclusiveStartKey,
    }),
  );
  return {
    items: (result.Items ?? []).map(toListItem),
    nextKey: result.LastEvaluatedKey,
  };
}

export async function listAssignments(): Promise<AssignmentListItem[]> {
  async function fetchAll(
    exclusiveStartKey?: Record<string, unknown>,
    accumulated: AssignmentListItem[] = [],
  ): Promise<AssignmentListItem[]> {
    if (accumulated.length >= MAX_LIST_ITEMS) {
      return accumulated.slice(0, MAX_LIST_ITEMS);
    }
    const { items, nextKey } = await queryAssignmentPage(exclusiveStartKey);
    const combined = [...accumulated, ...items];
    if (nextKey === undefined || combined.length >= MAX_LIST_ITEMS) {
      return combined.slice(0, MAX_LIST_ITEMS);
    }
    return fetchAll(nextKey, combined);
  }

  return fetchAll();
}

export async function createAssignment(params: {
  assignmentName: string;
  createdBy: string;
}): Promise<Assignment> {
  const assignmentId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const item = {
    PK: `ASSIGNMENT#${assignmentId}`,
    SK: 'META',
    GSI1PK: ASSIGNMENTS_GSI1PK,
    GSI1SK: createdAt,
    assignmentId,
    assignmentName: params.assignmentName.trim(),
    status: 'OPEN' as AssignmentStatus,
    createdAt,
    createdBy: params.createdBy,
    submittedTeamCount: 0,
  };
  await ddb().send(
    new PutCommand({
      TableName: tableName(),
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK)',
    }),
  );
  return toAssignment(toListItem(item));
}

export async function setAssignmentStatus(
  assignmentId: string,
  status: AssignmentStatus,
): Promise<Assignment> {
  try {
    const result = await ddb().send(
      new UpdateCommand({
        TableName: tableName(),
        Key: assignmentKey(assignmentId),
        UpdateExpression: 'SET #status = :status',
        ConditionExpression: 'attribute_exists(PK)',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ReturnValues: 'ALL_NEW',
      }),
    );
    return toAssignment(toListItem(result.Attributes ?? {}));
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') {
      throw new NotFoundError('Assignment', assignmentId);
    }
    throw err;
  }
}
