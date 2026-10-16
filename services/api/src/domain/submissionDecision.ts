/**
 * Quyết định khi tạo phiên nộp bài, giống mock `POST /api/teams/submit`:
 * chưa có nhóm -> nhóm mới; nhóm OPEN / RESUBMISSION_ALLOWED -> nộp vào đúng
 * nhóm đó; nhóm SUBMITTED -> 409.
 */
import type { Assignment, Team } from '@quick-grading/shared-types';
import {
  AssignmentClosedError,
  NotFoundError,
  TeamNameConflictError,
} from '@quick-grading/shared-types';

export type CreateDecision = { kind: 'NEW' } | { kind: 'EXISTING'; team: Team };

export function decideCreate(
  assignmentId: string,
  teamName: string,
  assignment: Assignment | undefined,
  existingTeam: Team | undefined,
): CreateDecision {
  if (assignment === undefined) {
    throw new NotFoundError('Assignment', assignmentId, 'Không tìm thấy đợt chấm.');
  }
  if (assignment.status !== 'OPEN') {
    throw new AssignmentClosedError(assignmentId);
  }
  if (existingTeam === undefined) {
    return { kind: 'NEW' };
  }
  if (existingTeam.status === 'SUBMITTED') {
    throw new TeamNameConflictError(teamName, assignmentId);
  }
  return { kind: 'EXISTING', team: existingTeam };
}
