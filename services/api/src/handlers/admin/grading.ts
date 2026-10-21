/**
 * Handler các route chấm bài và review kết quả của Admin (infra-plan mục 3.2, 6.5).
 *
 * - POST  /api/teams/{teamId}/grading
 * - POST  /api/assignments/{assignmentId}/grading
 * - GET   /api/teams/{teamId}/grading/history
 * - PATCH /api/teams/{teamId}/grading/{gradingAttemptId}/review
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { NotFoundError, ValidationError } from '@quick-grading/shared-types';
import { parseAssignmentId, parseTeamId } from '../../domain/validation.js';
import { jsonResponse } from '../../lib/http.js';
import { parseJsonBody } from '../../lib/router.js';
import { getAssignment } from '../../repositories/assignmentsRepo.js';
import {
  getGradingAttempt,
  listGradingHistory,
  submitReview,
} from '../../repositories/gradingRepo.js';
import { getTeam, listTeamsByAssignment } from '../../repositories/teamsRepo.js';
import { triggerGrading } from '../../services/gradingService.js';

export async function handleTriggerTeamGrading(
  event: APIGatewayProxyEventV2,
  username: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const teamId = parseTeamId(event.pathParameters?.teamId);

  const team = await getTeam(teamId);
  if (!team) {
    throw new NotFoundError('Team', teamId);
  }

  // Cho phép body gửi adminId override hoặc force override
  let body: Record<string, unknown> = {};
  if (event.body && event.body.trim().length > 0) {
    body = (parseJsonBody(event) ?? {}) as Record<string, unknown>;
  }
  const adminId = typeof body.adminId === 'string' && body.adminId.trim().length > 0
    ? body.adminId.trim()
    : username;

  const force = typeof body.force === 'boolean' ? body.force : true;

  const res = await triggerGrading({
    teamId,
    triggeredBy: adminId,
    force,
  });

  const attempt = await getGradingAttempt(teamId, res.gradingAttemptId);
  const resultPayload = attempt ?? {
    teamId,
    gradingAttemptId: res.gradingAttemptId,
    status: 'IN_PROGRESS',
    needsReview: false,
    reviewStatus: 'NOT_REQUIRED',
    idempotencyKey: res.idempotencyKey,
    triggeredBy: adminId,
  };

  return jsonResponse(202, resultPayload);
}

export async function handleTriggerAssignmentGrading(
  event: APIGatewayProxyEventV2,
  username: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const assignmentId = parseAssignmentId(event.pathParameters?.assignmentId);

  const assignment = await getAssignment(assignmentId);
  if (!assignment) {
    throw new NotFoundError('Assignment', assignmentId);
  }

  const teams = await listTeamsByAssignment(assignmentId, 'SUBMITTED');

  let triggered = 0;
  let skipped = 0;
  let failed = 0;
  const results: Array<{ teamId: string; status: string; gradingAttemptId?: string; error?: string }> = [];

  for (const team of teams) {
    try {
      const res = await triggerGrading({
        teamId: team.teamId,
        triggeredBy: username,
        force: false,
      });

      if (res.skipped) {
        skipped += 1;
        results.push({ teamId: team.teamId, status: 'SKIPPED', gradingAttemptId: res.gradingAttemptId });
      } else {
        triggered += 1;
        results.push({ teamId: team.teamId, status: 'TRIGGERED', gradingAttemptId: res.gradingAttemptId });
      }
    } catch (err: unknown) {
      failed += 1;
      results.push({
        teamId: team.teamId,
        status: 'FAILED',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return jsonResponse(202, {
    assignmentId,
    total: teams.length,
    triggered,
    skipped,
    failed,
    results,
  });
}

export async function handleListGradingHistory(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const teamId = parseTeamId(event.pathParameters?.teamId);

  const team = await getTeam(teamId);
  if (!team) {
    throw new NotFoundError('Team', teamId);
  }

  const history = await listGradingHistory(teamId);
  return jsonResponse(200, history);
}

export async function handleSubmitReview(
  event: APIGatewayProxyEventV2,
  username: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const teamId = parseTeamId(event.pathParameters?.teamId);
  const gradingAttemptId = event.pathParameters?.gradingAttemptId;
  if (!gradingAttemptId || gradingAttemptId.trim().length === 0) {
    throw new ValidationError('Thiếu gradingAttemptId.', 'gradingAttemptId');
  }

  const team = await getTeam(teamId);
  if (!team) {
    throw new NotFoundError('Team', teamId);
  }

  const body = (parseJsonBody(event) ?? {}) as Record<string, unknown>;

  const reviewedBy = typeof body.reviewedBy === 'string' && body.reviewedBy.trim().length > 0
    ? body.reviewedBy.trim()
    : username;

  let finalScore: number | undefined;
  if (body.finalScore !== undefined) {
    if (typeof body.finalScore !== 'number' || Number.isNaN(body.finalScore) || body.finalScore < 0) {
      throw new ValidationError('finalScore phải là số không âm.', 'finalScore');
    }
    finalScore = body.finalScore;
  }

  const updatedAttempt = await submitReview({
    teamId,
    gradingAttemptId: gradingAttemptId.trim(),
    reviewedBy,
    finalScore,
  });

  return jsonResponse(200, updatedAttempt);
}
