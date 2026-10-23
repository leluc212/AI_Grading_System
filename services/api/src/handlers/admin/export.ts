/**
 * Handler trích xuất dữ liệu bảng điểm toàn đợt cho Admin (infra-plan mục 3.2, 5).
 *
 * - GET /api/assignments/{assignmentId}/export-data
 *
 * Khớp hoàn toàn với shape `AssignmentExportData` trong `packages/api-client/src/exportApi.ts`.
 */
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { ReviewStatus } from '@quick-grading/shared-types';
import { NotFoundError } from '@quick-grading/shared-types';
import { parseAssignmentId } from '../../domain/validation.js';
import { jsonResponse } from '../../lib/http.js';
import { getAssignment } from '../../repositories/assignmentsRepo.js';
import { getLatestGradedAttempt } from '../../repositories/gradingRepo.js';
import { listTeamsByAssignment } from '../../repositories/teamsRepo.js';

export const NOT_GRADED_LABEL = 'CHƯA CHẤM' as const;

export interface ExportMember {
  memberName: string;
  studentCode?: string;
}

export interface ExportRow {
  teamName: string;
  members: ExportMember[];
  finalDisplayScore: number | typeof NOT_GRADED_LABEL;
  reviewStatus: ReviewStatus | null;
  gradedAt: string | null;
}

export interface AssignmentExportData {
  assignmentId: string;
  assignmentName: string;
  rows: ExportRow[];
}

function computeDisplayScore(attempt: {
  finalScore?: number;
  score?: number;
}): number | typeof NOT_GRADED_LABEL {
  if (typeof attempt.finalScore === 'number') {
    return attempt.finalScore;
  }
  if (typeof attempt.score === 'number') {
    return attempt.score;
  }
  return NOT_GRADED_LABEL;
}

export async function handleExportAssignmentData(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> {
  const assignmentId = parseAssignmentId(event.pathParameters?.assignmentId);

  const assignment = await getAssignment(assignmentId);
  if (!assignment) {
    throw new NotFoundError('Assignment', assignmentId);
  }

  const teams = await listTeamsByAssignment(assignmentId);

  const rows: ExportRow[] = await Promise.all(
    teams.map(async (team) => {
      const latestGraded = await getLatestGradedAttempt(team.teamId);

      let finalDisplayScore: number | typeof NOT_GRADED_LABEL = NOT_GRADED_LABEL;
      let reviewStatus: ReviewStatus | null = null;
      let gradedAt: string | null = null;

      if (latestGraded?.status === 'GRADED') {
        finalDisplayScore = computeDisplayScore(latestGraded);
        reviewStatus = latestGraded.reviewStatus ?? null;
        gradedAt = latestGraded.gradedAt ?? null;
      }

      return {
        teamName: team.teamName,
        members: team.members.map((m) => {
          const member: ExportMember = { memberName: m.memberName };
          if (m.studentCode !== undefined) {
            member.studentCode = m.studentCode;
          }
          return member;
        }),
        finalDisplayScore,
        reviewStatus,
        gradedAt,
      };
    }),
  );

  const exportData: AssignmentExportData = {
    assignmentId: assignment.assignmentId,
    assignmentName: assignment.assignmentName,
    rows,
  };

  return jsonResponse(200, exportData);
}
