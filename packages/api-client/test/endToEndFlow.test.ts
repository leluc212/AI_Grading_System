/**
 * Test trọn luồng nghiệp vụ ở tầng service (hỗ trợ task 12.2).
 *
 * Đi đúng thứ tự mà task 12.2 yêu cầu kiểm thử: tạo assignment -> nộp bài ->
 * đóng assignment -> thử nộp bị chặn -> mở khoá nộp lại -> nộp lại -> trigger
 * chấm -> review -> xuất dữ liệu điểm.
 *
 * ## Quan hệ với việc kiểm thử TAY ở task 12.2
 *
 * Test này KHÔNG thay thế được việc bấm thật trên trình duyệt: nó không kiểm
 * được giao diện, điều hướng, hay việc MSW Service Worker có chặn request
 * đúng không. Giá trị của nó là chốt phần có thể tự động hoá — rằng chuỗi lời
 * gọi service layer + mock handler khớp nhau từ đầu tới cuối — để khi kiểm
 * thử tay, nếu có lỗi thì gần như chắc chắn nằm ở tầng UI chứ không phải ở
 * luồng dữ liệu. Danh sách bước kiểm thử tay nằm ở
 * `docs/manual-test-checklist.md`.
 *
 * _Requirements: 1.1, 1.4, 1.8, 2.9, 2.14, 6.2, 6.4, 7.1, 7.4, 8.1, 8.3, 10.2_
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GradingResult } from '@quick-grading/shared-types';
import { AssignmentClosedError, ValidationError } from '@quick-grading/shared-types';
import { resetMockDb } from '@quick-grading/mock-server';
import {
  assignmentsApi,
  exportApi,
  gradingApi,
  rubricsApi,
  teamsApi,
  NOT_GRADED_LABEL,
} from '../src/index.js';
import { makeMdFile, makeValidMember, makeXmlFile } from './helpers.js';

const ADMIN = 'admin';

/**
 * Chờ lượt chấm rời trạng thái đang chạy.
 *
 * Mock handler hoàn tất lượt chấm OUT-OF-BAND qua `setTimeout` (~1.5-2s) nên
 * phải poll giống đúng cách UI làm. Dùng timer thật thay vì fake timers: ở đây
 * `setTimeout` nằm trong handler của MSW, trộn fake timers vào làm test khó
 * đoán hơn nhiều so với việc chờ thật ~2 giây.
 */
async function waitForGradingToSettle(teamId: string): Promise<GradingResult> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const latest = await gradingApi.getLatestGrading(teamId);
    if (latest !== null && latest.status !== 'IN_PROGRESS' && latest.status !== 'PENDING') {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Lượt chấm không hoàn tất trong thời gian chờ.');
}

beforeEach(() => {
  resetMockDb();
  /**
   * Cố định `Math.random` để lượt chấm giả lập cho kết quả xác định.
   *
   * Handler dùng `Math.random` cho 2 việc: quyết định lỗi giả lập (<0.1) và
   * sinh điểm (`floor(random*41)+60`). Giá trị 0.2 cho: không lỗi, điểm 68 —
   * dưới ngưỡng 70 nên `needsReview = true`, tức là luồng review có dữ liệu
   * để chạy. Không cố định thì test sẽ đỏ ngẫu nhiên ~10% số lần chạy.
   */
  vi.spyOn(Math, 'random').mockReturnValue(0.2);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Luồng end-to-end ở tầng service (task 12.2)', () => {
  it('chạy trọn vẹn từ tạo đợt chấm tới xuất dữ liệu điểm', async () => {
    // --- Bước 1: Admin tạo đợt chấm mới (Requirement 1.1) ---
    const assignment = await assignmentsApi.createAssignment({
      assignmentName: 'Đợt E2E - Kiểm thử tổng hợp',
    });
    expect(assignment.status).toBe('OPEN');

    // Đợt mới xuất hiện trong danh sách, chưa có nhóm nào nộp (Requirement 1.3).
    const listed = await assignmentsApi.listAssignments();
    const listedNew = listed.find((a) => a.assignmentId === assignment.assignmentId);
    expect(listedNew?.submittedTeamCount).toBe(0);

    // --- Bước 2: Nhóm nộp bài (Requirement 2.9) ---
    const submitted = await teamsApi.createTeamAndSubmit({
      assignmentId: assignment.assignmentId,
      teamName: 'Nhóm E2E',
      members: [makeValidMember()],
      mdFile: makeMdFile(),
      xmlFile: makeXmlFile(),
    });
    expect(submitted.team.status).toBe('SUBMITTED');
    expect(submitted.files).toHaveLength(2);

    // Số nhóm đã nộp được cập nhật.
    const afterSubmit = await assignmentsApi.listAssignments();
    expect(
      afterSubmit.find((a) => a.assignmentId === assignment.assignmentId)?.submittedTeamCount,
    ).toBe(1);

    // --- Bước 3: Admin đóng đợt chấm (Requirement 1.4) ---
    const closed = await assignmentsApi.setAssignmentStatus(assignment.assignmentId, 'CLOSED');
    expect(closed.status).toBe('CLOSED');

    // --- Bước 4: Nộp bài vào đợt đã đóng bị chặn (Requirement 1.8) ---
    await expect(
      teamsApi.createTeamAndSubmit({
        assignmentId: assignment.assignmentId,
        teamName: 'Nhóm Nộp Muộn',
        members: [makeValidMember()],
        mdFile: makeMdFile(),
        xmlFile: makeXmlFile(),
      }),
    ).rejects.toBeInstanceOf(AssignmentClosedError);

    // Mở lại để tiếp tục luồng (Requirement 1.5).
    await assignmentsApi.setAssignmentStatus(assignment.assignmentId, 'OPEN');

    // --- Bước 5: Admin mở khoá nộp lại (Requirement 8.1) ---
    const unlocked = await teamsApi.unlockResubmission(submitted.team.teamId, ADMIN);
    expect(unlocked.status).toBe('RESUBMISSION_ALLOWED');
    expect(unlocked.unlockedBy).toBe(ADMIN);

    // --- Bước 6: Nhóm nộp lại (Requirement 2.14, 8.3) ---
    //
    // Đi qua ĐÚNG đường mà UI Submitter dùng: nhập lại tên nhóm cũ ở form nộp
    // bài. `createTeamAndSubmit` nhận ra nhóm đang `RESUBMISSION_ALLOWED` và
    // xử lý như nộp lại thay vì tạo nhóm trùng tên. (Endpoint
    // `resubmitTeamFiles` vẫn tồn tại và được kiểm riêng ở
    // `teamsApi.resubmission.test.ts`, nhưng nó cần `teamId` nên không dùng
    // được từ khu vực public.)
    const resubmitted = await teamsApi.createTeamAndSubmit({
      assignmentId: assignment.assignmentId,
      teamName: 'Nhóm E2E',
      members: [makeValidMember()],
      mdFile: makeMdFile('# Bài làm v2'),
      xmlFile: makeXmlFile('<submission><answer>99</answer></submission>'),
    });
    expect(resubmitted.resubmitted).toBe(true);
    // Property 1: vẫn đúng 1 nhóm, không sinh nhóm trùng tên.
    expect(resubmitted.team.teamId).toBe(submitted.team.teamId);
    expect(resubmitted.files).toHaveLength(2);
    expect(resubmitted.files.every((f) => f.isLatest)).toBe(true);

    // Nhóm trở lại SUBMITTED.
    const afterResubmit = await teamsApi.getTeam(submitted.team.teamId);
    expect(afterResubmit.status).toBe('SUBMITTED');

    // --- Bước 7: Admin trigger chấm bài (Requirement 6.2) ---
    const activeRubric = await rubricsApi.getActiveRubric();
    expect(activeRubric).not.toBeNull();

    const triggered = await gradingApi.triggerGrading(submitted.team.teamId, ADMIN);
    expect(triggered.status).toBe('IN_PROGRESS');
    // Requirement 9.3: lượt chấm ghi lại rubric version đang dùng.
    expect(triggered.rubricVersion).toBe(activeRubric?.version);

    const graded = await waitForGradingToSettle(submitted.team.teamId);
    // Requirement 6.4: chấm xong có điểm, feedback, gradedBy = AI.
    expect(graded.status).toBe('GRADED');
    expect(graded.score).toBe(68);
    expect(graded.gradedBy).toBe('AI');
    expect(graded.aiFeedback).toBeDefined();
    // Điểm 68 < ngưỡng 70 -> cần review (Requirement 7.1).
    expect(graded.needsReview).toBe(true);
    expect(graded.reviewStatus).toBe('PENDING_REVIEW');

    // --- Bước 8: Admin review và sửa điểm (Requirement 7.4, 7.5) ---
    const reviewed = await gradingApi.submitReview(submitted.team.teamId, graded.gradingAttemptId, {
      reviewedBy: ADMIN,
      finalScore: 75,
    });
    expect(reviewed.reviewStatus).toBe('REVIEWED');
    expect(reviewed.finalScore).toBe(75);
    // Property 5: điểm gốc của AI KHÔNG bị ghi đè.
    expect(reviewed.score).toBe(68);

    // Lịch sử chấm giữ lại đúng 1 lượt (Requirement 6.6).
    const history = await gradingApi.listGradingHistory(submitted.team.teamId);
    expect(history).toHaveLength(1);

    // --- Bước 9: Xuất dữ liệu điểm (Requirement 10.2, 7.6) ---
    const exportData = await exportApi.getAssignmentExportData(assignment.assignmentId);
    expect(exportData.rows).toHaveLength(1);
    const row = exportData.rows[0];
    expect(row.teamName).toBe('Nhóm E2E');
    // Requirement 7.6: ưu tiên finalScore sau review.
    expect(row.finalDisplayScore).toBe(75);
    expect(row.reviewStatus).toBe('REVIEWED');
    expect(row.members[0].studentCode).toBe('SV999');
  });

  it('nhóm chưa chấm xuất ra "CHƯA CHẤM", không phải để trống (Requirement 10.3)', async () => {
    const assignment = await assignmentsApi.createAssignment({ assignmentName: 'Đợt E2E - 2' });
    await teamsApi.createTeamAndSubmit({
      assignmentId: assignment.assignmentId,
      teamName: 'Nhóm Không Chấm',
      members: [makeValidMember()],
      mdFile: makeMdFile(),
      xmlFile: makeXmlFile(),
    });

    const exportData = await exportApi.getAssignmentExportData(assignment.assignmentId);

    expect(exportData.rows[0].finalDisplayScore).toBe(NOT_GRADED_LABEL);
    expect(exportData.rows[0].gradedAt).toBeNull();
  });

  it('nộp lại khi nhóm CHƯA được mở khoá thì bị chặn (Requirement 2.14)', async () => {
    const assignment = await assignmentsApi.createAssignment({ assignmentName: 'Đợt E2E - 3' });
    const submitted = await teamsApi.createTeamAndSubmit({
      assignmentId: assignment.assignmentId,
      teamName: 'Nhóm Chưa Mở Khoá',
      members: [makeValidMember()],
      mdFile: makeMdFile(),
      xmlFile: makeXmlFile(),
    });

    // Chốt chặn nằm ở server, không phụ thuộc việc UI có hiện nút hay không.
    await expect(
      teamsApi.resubmitTeamFiles(submitted.team.teamId, makeMdFile(), makeXmlFile()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('chấm lại tạo lượt mới và giữ nguyên lượt cũ (Requirement 6.6)', async () => {
    const assignment = await assignmentsApi.createAssignment({ assignmentName: 'Đợt E2E - 4' });
    const submitted = await teamsApi.createTeamAndSubmit({
      assignmentId: assignment.assignmentId,
      teamName: 'Nhóm Chấm Hai Lần',
      members: [makeValidMember()],
      mdFile: makeMdFile(),
      xmlFile: makeXmlFile(),
    });

    await gradingApi.triggerGrading(submitted.team.teamId, ADMIN);
    const first = await waitForGradingToSettle(submitted.team.teamId);

    await gradingApi.triggerGrading(submitted.team.teamId, ADMIN);
    const second = await waitForGradingToSettle(submitted.team.teamId);

    const history = await gradingApi.listGradingHistory(submitted.team.teamId);
    expect(history).toHaveLength(2);
    // Property 4: lượt cũ vẫn còn nguyên, không bị ghi đè.
    expect(history[0].gradingAttemptId).toBe(first.gradingAttemptId);
    expect(history[1].gradingAttemptId).toBe(second.gradingAttemptId);
    expect(first.gradingAttemptId).not.toBe(second.gradingAttemptId);
  });
});
