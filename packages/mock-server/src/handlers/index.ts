/**
 * MSW request handlers.
 *
 * Gộp toàn bộ handler theo domain (Assignment, Team, submit, resubmission,
 * team-files, grading, rubric, export, auth) vào 1 mảng `handlers` duy
 * nhất, dùng bởi `browser.ts` (`setupWorker(...handlers)`), mỗi domain 1
 * file trong thư mục này.
 *
 * See design.md > Mock Server Design (Giai đoạn 1).
 */
import type { HttpHandler } from 'msw';
import { assignmentHandlers } from './assignments.js';
import { teamHandlers } from './teams.js';
import { submissionHandlers } from './submissions.js';
import { resubmissionHandlers } from './resubmission.js';
import { teamFilesHandlers } from './team-files.js';
import { gradingHandlers } from './grading.js';
import { rubricHandlers } from './rubrics.js';
import { exportHandlers } from './export.js';
import { authHandlers } from './auth.js';

export const handlers: HttpHandler[] = [
  ...assignmentHandlers,
  ...teamHandlers,
  ...submissionHandlers,
  ...resubmissionHandlers,
  ...teamFilesHandlers,
  ...gradingHandlers,
  ...rubricHandlers,
  ...exportHandlers,
  ...authHandlers,
];
