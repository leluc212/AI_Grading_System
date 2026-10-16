/**
 * Lambda `public-api`: 5 route công khai của trang nộp bài (infra-plan mục 5).
 *
 *   GET  /api/assignments
 *   GET  /api/assignments/{assignmentId}
 *   GET  /api/teams/check-name?assignmentId=&teamName=
 *   POST /api/submissions
 *   POST /api/submissions/{submissionId}/finalize
 *
 * Không có route nào đọc kết quả chấm (Property 6). Mỗi request log đúng 1 dòng
 * chỉ gồm id/status/thời gian.
 */
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { NotFoundError } from '@quick-grading/shared-types';
import {
  parseAssignmentId,
  parseCheckNameQuery,
  parseCreateSubmissionRequest,
  parseSubmissionId,
} from '../domain/validation.js';
import { errorResponse, jsonResponse } from '../lib/http.js';
import { log } from '../lib/logger.js';
import { createRouter, parseJsonBody } from '../lib/router.js';
import { getAssignment, listAssignments, toAssignment } from '../repositories/assignmentsRepo.js';
import {
  checkTeamName,
  createSubmission,
  finalizeSubmission,
} from '../services/submissionService.js';

/** Id an toàn để log (đã qua validate), gắn trong lúc xử lý. */
interface LogIds {
  assignmentId?: string;
  teamId?: string;
  submissionId?: string;
}

function buildRouter(ids: LogIds) {
  return createRouter({
    'GET /api/assignments': async () => {
      return jsonResponse(200, await listAssignments());
    },

    'GET /api/assignments/{assignmentId}': async (event) => {
      const assignmentId = parseAssignmentId(event.pathParameters?.assignmentId);
      ids.assignmentId = assignmentId;
      const assignment = await getAssignment(assignmentId);
      if (assignment === undefined) {
        throw new NotFoundError('Assignment', assignmentId, 'Không tìm thấy đợt chấm.');
      }
      return jsonResponse(200, toAssignment(assignment));
    },

    'GET /api/teams/check-name': async (event) => {
      const { assignmentId, teamName } = parseCheckNameQuery(event.queryStringParameters);
      ids.assignmentId = assignmentId;
      return jsonResponse(200, await checkTeamName(assignmentId, teamName));
    },

    'POST /api/submissions': async (event) => {
      const req = parseCreateSubmissionRequest(parseJsonBody(event));
      ids.assignmentId = req.assignmentId;
      const response = await createSubmission(req);
      ids.submissionId = response.submissionId;
      return jsonResponse(201, response);
    },

    'POST /api/submissions/{submissionId}/finalize': async (event) => {
      const submissionId = parseSubmissionId(event.pathParameters?.submissionId);
      ids.submissionId = submissionId;
      const result = await finalizeSubmission(submissionId);
      ids.teamId = result.team.teamId;
      ids.assignmentId = result.team.assignmentId;
      return jsonResponse(result.status, {
        team: result.team,
        files: result.files,
        resubmitted: result.resubmitted,
      });
    },
  });
}

export async function handler(
  event: APIGatewayProxyEventV2,
  context?: Context,
): Promise<APIGatewayProxyStructuredResultV2> {
  const started = Date.now();
  const requestId = context?.awsRequestId ?? event.requestContext?.requestId;
  const routeKey = event.routeKey;
  const ids: LogIds = {};
  let response: APIGatewayProxyStructuredResultV2;
  try {
    response = await buildRouter(ids)(event);
  } catch (err) {
    response = errorResponse(err, { requestId, routeKey });
  }
  log('info', 'request', {
    requestId,
    routeKey,
    ...ids,
    status: response.statusCode,
    durationMs: Date.now() - started,
    errorCode:
      response.statusCode !== undefined && response.statusCode >= 400
        ? (JSON.parse(response.body ?? '{}') as { code?: string }).code
        : undefined,
  });
  return response;
}
