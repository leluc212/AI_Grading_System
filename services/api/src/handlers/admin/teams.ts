/**
 * Handler các route quản lý nhóm và bài nộp của Admin (infra-plan mục 3.2, 5).
 *
 * - GET   /api/assignments/{assignmentId}/teams
 * - GET   /api/teams/{teamId}
 * - PATCH /api/teams/{teamId}/unlock
 * - GET   /api/teams/{teamId}/files
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { TeamStatus } from '@quick-grading/shared-types';
import { NotFoundError, ValidationError } from '@quick-grading/shared-types';
import { parseAssignmentId, parseTeamId } from '../../domain/validation.js';
import { jsonResponse } from '../../lib/http.js';
import {
  getTeam,
  getTeamRecord,
  getSubmission,
  listTeamsByAssignment,
  unlockTeamResubmission,
} from '../../repositories/teamsRepo.js';
import { createPresignedGetUrl, readObjectText } from '../../storage/s3.js';

export async function handleListTeams(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const assignmentId = parseAssignmentId(event.pathParameters?.assignmentId);
  const statusParam = event.queryStringParameters?.status as TeamStatus | undefined;

  const teams = await listTeamsByAssignment(assignmentId, statusParam);
  return jsonResponse(200, teams);
}

export async function handleGetTeam(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const teamId = parseTeamId(event.pathParameters?.teamId);
  const team = await getTeam(teamId);
  if (!team) {
    throw new NotFoundError('Team', teamId);
  }
  return jsonResponse(200, team);
}

export async function handleUnlockTeam(
  event: APIGatewayProxyEventV2,
  username: string,
): Promise<APIGatewayProxyStructuredResultV2> {
  const teamId = parseTeamId(event.pathParameters?.teamId);
  const team = await unlockTeamResubmission(teamId, username);
  return jsonResponse(200, team);
}

export async function handleGetTeamFiles(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const teamId = parseTeamId(event.pathParameters?.teamId);
  const team = await getTeamRecord(teamId);
  if (!team) {
    throw new NotFoundError('Team', teamId);
  }

  if (!team.latestSubmissionId) {
    throw new ValidationError('Nhóm chưa nộp đủ 2 file.');
  }

  const submission = await getSubmission(teamId, team.latestSubmissionId);
  if (!submission?.files?.md || !submission?.files?.xml) {
    throw new ValidationError('Nhóm chưa nộp đủ 2 file.');
  }

  const mdKey = submission.files.md.s3Key;
  const xmlKey = submission.files.xml.s3Key;

  // Sinh presigned GET 5 phút và đọc nội dung đồng thời (đáp ứng cả 2 contract)
  const [mdUrl, xmlUrl, md, xml] = await Promise.all([
    createPresignedGetUrl(mdKey, 300),
    createPresignedGetUrl(xmlKey, 300),
    readObjectText(mdKey),
    readObjectText(xmlKey),
  ]);

  return jsonResponse(200, {
    md,
    xml,
    mdUrl,
    xmlUrl,
  });
}
