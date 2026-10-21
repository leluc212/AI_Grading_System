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

/** Chỉ copy field công khai, không trả PK/SK/GSI ra ngoài. */
export function toListItem(item: Record<string, unknown>): AssignmentListItem {
  return {
    assignmentId: String(item.assignmentId),
    assignmentName: String(item.assignmentName),
    status: toStatus(item.status),
    createdAt: String(item.createdAt),
    createdBy: String(item.createdBy ?? ''),
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

export async function listAssignments(): Promise<AssignmentListItem[]> {
  const items: AssignmentListItem[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
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
    for (const item of result.Items ?? []) {
      items.push(toListItem(item));
    }
    exclusiveStartKey = result.LastEvaluatedKey;
  } while (exclusiveStartKey !== undefined && items.length < MAX_LIST_ITEMS);
  return items.slice(0, MAX_LIST_ITEMS);
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
