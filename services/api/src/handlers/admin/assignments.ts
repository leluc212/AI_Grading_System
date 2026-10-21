/**
 * Handler các route quản lý đợt chấm của Admin (infra-plan mục 3.2, 5).
 *
 * - POST  /api/assignments
 * - PATCH /api/assignments/{assignmentId}/status
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { AssignmentStatus } from '@quick-grading/shared-types';
import { ValidationError } from '@quick-grading/shared-types';
import { parseAssignmentId } from '../../domain/validation.js';
import { jsonResponse } from '../../lib/http.js';
import { parseJsonBody } from '../../lib/router.js';
import { createAssignment, setAssignmentStatus } from '../../repositories/assignmentsRepo.js';

const VALID_STATUSES: AssignmentStatus[] = ['OPEN', 'CLOSED'];

export async function handleCreateAssignment(
  event: APIGatewayProxyEventV2,
  username: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const body = parseJsonBody(event) as Record<string, unknown> | undefined;
  const rawName = body?.assignmentName;

  if (typeof rawName !== 'string' || rawName.trim().length === 0) {
    throw new ValidationError('Tên Assignment không được để trống.', 'assignmentName');
  }

  const trimmedName = rawName.trim();
  if (trimmedName.length > 100) {
    throw new ValidationError('Tên Assignment không được vượt quá 100 ký tự.', 'assignmentName');
  }

  const assignment = await createAssignment({
    assignmentName: trimmedName,
    createdBy: username,
  });

  return jsonResponse(201, assignment);
}

export async function handleSetAssignmentStatus(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const assignmentId = parseAssignmentId(event.pathParameters?.assignmentId);
  const body = parseJsonBody(event) as Record<string, unknown> | undefined;
  const status = body?.status;

  if (typeof status !== 'string' || !VALID_STATUSES.includes(status as AssignmentStatus)) {
    throw new ValidationError(`status phải là 1 trong: ${VALID_STATUSES.join(', ')}.`, 'status');
  }

  const assignment = await setAssignmentStatus(assignmentId, status as AssignmentStatus);
  return jsonResponse(200, assignment);
}
