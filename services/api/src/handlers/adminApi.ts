/**
 * Lambda `admin-api`: Các route quản trị được bảo vệ bởi Cognito JWT (infra-plan mục 3, 3.1, 5).
 *
 * Mọi request đến handler này đã được API Gateway xác thực tính hợp lệ của JWT token.
 * Danh tính người thực hiện lấy trực tiếp từ JWT claims (`cognito:username` hoặc `username`).
 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { errorResponse } from '../lib/http.js';
import { log } from '../lib/logger.js';
import { createRouter } from '../lib/router.js';
import { handleCreateAssignment, handleSetAssignmentStatus } from './admin/assignments.js';
import { handleExportAssignmentData } from './admin/export.js';
import {
  handleCreateGradingConfig,
  handleGetActiveGradingConfig,
  handleListGradingConfigVersions,
} from './admin/gradingConfig.js';
import {
  handleListGradingHistory,
  handleSubmitReview,
  handleTriggerAssignmentGrading,
  handleTriggerTeamGrading,
} from './admin/grading.js';
import {
  handleCreateRubric,
  handleGetActiveRubric,
  handleListRubricVersions,
} from './admin/rubrics.js';
import {
  handleGetTeam,
  handleGetTeamFiles,
  handleListTeams,
  handleUnlockTeam,
} from './admin/teams.js';

export function getAdminUsername(event: APIGatewayProxyEventV2): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const claims = (event.requestContext as any)?.authorizer?.jwt?.claims;
  const username = claims?.['cognito:username'] ?? claims?.username ?? claims?.sub ?? 'admin';
  return String(username);
}

function buildAdminRouter(username: string) {
  return createRouter({
    'GET /api/rubrics/active': async () => {
      return handleGetActiveRubric();
    },

    'GET /api/rubrics': async () => {
      return handleListRubricVersions();
    },

    'POST /api/rubrics': async (event) => {
      return handleCreateRubric(event);
    },

    'GET /api/grading-config/active': async () => {
      return handleGetActiveGradingConfig();
    },

    'GET /api/grading-config': async () => {
      return handleListGradingConfigVersions();
    },

    'POST /api/grading-config': async (event) => {
      return handleCreateGradingConfig(event, username);
    },

    'POST /api/assignments': async (event) => {
      return handleCreateAssignment(event, username);
    },

    'PATCH /api/assignments/{assignmentId}/status': async (event) => {
      return handleSetAssignmentStatus(event);
    },

    'GET /api/assignments/{assignmentId}/teams': async (event) => {
      return handleListTeams(event);
    },

    'GET /api/teams/{teamId}': async (event) => {
      return handleGetTeam(event);
    },

    'PATCH /api/teams/{teamId}/unlock': async (event) => {
      return handleUnlockTeam(event, username);
    },

    'GET /api/teams/{teamId}/files': async (event) => {
      return handleGetTeamFiles(event);
    },

    'POST /api/teams/{teamId}/grading': async (event) => {
      return handleTriggerTeamGrading(event, username);
    },

    'POST /api/assignments/{assignmentId}/grading': async (event) => {
      return handleTriggerAssignmentGrading(event, username);
    },

    'GET /api/teams/{teamId}/grading/history': async (event) => {
      return handleListGradingHistory(event);
    },

    'PATCH /api/teams/{teamId}/grading/{gradingAttemptId}/review': async (event) => {
      return handleSubmitReview(event, username);
    },

    'GET /api/assignments/{assignmentId}/export-data': async (event) => {
      return handleExportAssignmentData(event);
    },
  });
}

export async function handler(
  event: APIGatewayProxyEventV2,
  context?: Context,
): Promise<APIGatewayProxyStructuredResultV2> {
  const startedAt = Date.now();
  const username = getAdminUsername(event);

  try {
    const router = buildAdminRouter(username);
    const res = await router(event);

    log('info', `${event.requestContext.http.method} ${event.rawPath} -> ${res.statusCode}`, {
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      username,
      requestId: context?.awsRequestId,
    });

    return res;
  } catch (err: unknown) {
    const res = errorResponse(err);
    log('error', `Lỗi xử lý admin API: ${event.rawPath}`, {
      status: res.statusCode,
      errorName: (err as Error)?.name,
      durationMs: Date.now() - startedAt,
      username,
      requestId: context?.awsRequestId,
    });
    return res;
  }
}
