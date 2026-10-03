/**
 * MSW handler cho domain Grading (task 3.8) — `triggerGrading`,
 * `listGradingHistory`, `submitReview`.
 *
 * Endpoint tương ứng các hàm service layer `gradingApi` mô tả ở design.md >
 * API Contract (Service Layer):
 *   - POST  /api/teams/:teamId/grading                          -> triggerGrading(teamId, adminId)
 *   - GET   /api/teams/:teamId/grading/history                  -> listGradingHistory(teamId)
 *   - PATCH /api/teams/:teamId/grading/:gradingAttemptId/review -> submitReview(teamId, gradingAttemptId, input)
 *
 * `getLatestGrading` (cũng có trong API Contract) KHÔNG cần endpoint riêng ở
 * mock server — service layer (task 4.2) có thể suy ra được từ
 * `listGradingHistory` (lấy phần tử cuối mảng, vốn đã theo thứ tự chèn
 * chronological — xem `listGradingHistory` dưới đây).
 *
 * Lỗi trả về theo format `{ code, message }` (xem design.md > Error
 * Handling), tái dùng trực tiếp typed error class ở `shared-types`.
 *
 * _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 7.3, 7.4, 7.5, 9.3_
 */
import { http, HttpResponse } from 'msw';
import type { GradingResult } from '@quick-grading/shared-types';
import {
  DomainError,
  GRADING_SCALE,
  GradingInProgressError,
  NotFoundError,
  ValidationError,
  getNeedsReviewThreshold,
} from '@quick-grading/shared-types';
import { getDb, saveDb } from '../db.js';

/** Chuyển 1 typed `DomainError` thành response `{ code, message }` đúng httpStatus của nó */
function errorResponse(error: DomainError) {
  return HttpResponse.json(
    { code: error.code, message: error.message },
    { status: error.httpStatus },
  );
}

/** Xác suất 1 lượt chấm giả lập kết thúc `FAILED` — design.md > Mock Server Design ("~10% request") */
const SIMULATED_FAILURE_RATE = 0.1;

/**
 * Điểm thấp nhất mà AI Grader giả lập có thể sinh ra: 60% thang điểm.
 *
 * Suy ra từ `GRADING_SCALE` thay vì hardcode, để đổi thang điểm (ví dụ sang
 * 0-10) thì khoảng điểm giả lập tự co giãn theo, không sinh ra điểm 85 trên
 * thang 10.
 */
const SIMULATED_MIN_SCORE = Math.round(GRADING_SCALE.max * 0.6);

/**
 * Giả lập việc AI Grader hoàn tất 1 lượt chấm, chạy sau 1 khoảng delay qua
 * `setTimeout` (xem lời gọi trong handler `POST /grading` dưới đây).
 *
 * QUAN TRỌNG: hàm này chạy hoàn toàn OUT-OF-BAND so với request/response
 * ban đầu — request `triggerGrading` đã trả `202 IN_PROGRESS` cho client
 * từ trước đó. Do đó phải LUÔN đọc lại `GradingResult` từ `getDb()` bằng
 * `gradingAttemptId` tại thời điểm callback này thực thi (không capture
 * reference cũ từ closure), để tránh ghi đè lên state đã bị thay đổi bởi
 * request khác trong lúc chờ (ví dụ nếu sau này có thêm endpoint hủy lượt
 * chấm). UI (các task sau, 9.1/9.2) phải tự poll `listGradingHistory` /
 * `getLatestGrading` để thấy được transition này — ở giai đoạn 1 không có
 * WebSocket/SSE nào đẩy update real-time.
 */
function completeGradingAsync(gradingAttemptId: string): void {
  const result = getDb().gradingResults.find((g) => g.gradingAttemptId === gradingAttemptId);
  if (!result) {
    // Lượt chấm không còn tồn tại (ví dụ db đã bị reset trong lúc chờ) —
    // không có gì để cập nhật.
    return;
  }

  const isSimulatedFailure = Math.random() < SIMULATED_FAILURE_RATE;

  if (isSimulatedFailure) {
    // Requirement 6.5: lỗi AI Grader/timeout -> status FAILED kèm errorMessage.
    result.status = 'FAILED';
    result.errorMessage = 'AI Grader timeout: không nhận được phản hồi sau nhiều lần thử lại.';
  } else {
    // Requirement 6.4: chấm thành công -> lưu score, aiFeedback, needsReview,
    // gradedAt, gradedBy = AI.
    // Rule đơn giản (stub AI Grader thật sẽ thay ở giai đoạn 3): điểm ngẫu
    // nhiên trong khoảng [SIMULATED_MIN_SCORE, GRADING_SCALE.max] — với thang
    // 0-100 là 60-100, đủ để test cả 2 nhánh needsReview.
    const scoreSpan = GRADING_SCALE.max - SIMULATED_MIN_SCORE + 1;
    const score = SIMULATED_MIN_SCORE + Math.floor(Math.random() * scoreSpan);
    result.status = 'GRADED';
    result.score = score;
    result.aiFeedback =
      'Bài làm đáp ứng phần lớn yêu cầu của rubric. AI Grader (giả lập) ghi nhận cấu trúc file rõ ràng; ' +
      'Admin nên xem lại chi tiết nếu điểm nằm trong vùng cần review.';
    result.gradedAt = new Date().toISOString();
    result.gradedBy = 'AI';
    result.needsReview = score < getNeedsReviewThreshold();
    result.reviewStatus = result.needsReview ? 'PENDING_REVIEW' : 'NOT_REQUIRED';
  }

  saveDb();
}

export const gradingHandlers = [
  // POST /api/teams/:teamId/grading — Requirement 6.2, 6.3, 6.5, 6.6, 9.3
  http.post('/api/teams/:teamId/grading', async ({ params, request }) => {
    const teamId = params.teamId as string;

    const team = getDb().teams.find((t) => t.teamId === teamId);
    if (!team) {
      return errorResponse(new NotFoundError('Team', teamId));
    }

    const body = await request.json().catch(() => null);
    const adminId = (body as { adminId?: unknown } | null)?.adminId;
    if (typeof adminId !== 'string' || adminId.trim().length === 0) {
      return errorResponse(new ValidationError('Thiếu adminId.', 'adminId'));
    }

    // Requirement 6.2: chỉ chấm được nhóm đã nộp đủ 2 file. Check tối thiểu
    // (không cần validate nội dung file) — đủ 2 bản ghi `isLatest = true`
    // (1 `.md` + 1 `.xml`) cho teamId này. Team ở trạng thái `SUBMITTED`
    // hoặc `RESUBMISSION_ALLOWED` (đã nộp trước đó, đang chờ nộp lại) đều
    // hợp lệ ở check này vì cả 2 đều có bộ file `isLatest` từ lượt nộp gần
    // nhất; chỉ team chưa từng nộp (`OPEN`, không có file nào) mới bị chặn.
    const latestFileCount = getDb().submissionFiles.filter(
      (f) => f.teamId === teamId && f.isLatest,
    ).length;
    if (latestFileCount < 2) {
      return errorResponse(
        new ValidationError('Nhóm chưa nộp đủ 2 file, không thể chấm bài.', 'teamId'),
      );
    }

    // Requirement 6.3, Property 3 (design.md): không cho phép 2 lượt chấm
    // IN_PROGRESS song song cho cùng 1 nhóm. Handler đồng bộ (không có
    // `await` nào giữa check và commit dưới đây) nên không có khoảng hở
    // race condition trong nội bộ 1 lần gọi — giống nguyên tắc atomic-commit
    // đã áp dụng ở `submissions.ts`.
    const inProgress = getDb().gradingResults.find(
      (g) => g.teamId === teamId && g.status === 'IN_PROGRESS',
    );
    if (inProgress) {
      return errorResponse(new GradingInProgressError(teamId));
    }

    // Requirement 9.3, 9.4: ghi lại rubricVersion của rubric đang active tại
    // thời điểm trigger. Nếu chưa có rubric nào active (ví dụ db bị xoá
    // sạch/rubric mới lưu chưa set isActive) — bỏ qua trường này
    // (`rubricVersion: undefined`) thay vì chặn cả việc chấm bài; đây là 1
    // edge case không nên xảy ra với seed data mặc định (luôn có 1 rubric
    // active) nhưng vẫn xử lý an toàn.
    const activeRubric = getDb().rubrics.find((r) => r.isActive);

    const gradingResult: GradingResult = {
      teamId,
      gradingAttemptId: crypto.randomUUID(),
      status: 'IN_PROGRESS',
      needsReview: false,
      reviewStatus: 'NOT_REQUIRED',
      idempotencyKey: crypto.randomUUID(),
      triggeredBy: adminId.trim(),
      rubricVersion: activeRubric?.version,
    };

    getDb().gradingResults.push(gradingResult);
    saveDb();

    // Giả lập chấm bài bất đồng bộ (design.md > Mock Server Design): sau
    // ~1.5-2s, cập nhật lượt chấm này thành GRADED hoặc FAILED (~10%).
    // Handler trả response NGAY với status IN_PROGRESS; việc hoàn tất diễn
    // ra out-of-band, UI phải tự poll để thấy kết quả cuối (xem JSDoc của
    // `completeGradingAsync`).
    const delayMs = 1500 + Math.random() * 500;
    setTimeout(() => completeGradingAsync(gradingResult.gradingAttemptId), delayMs);

    // 202 Accepted: yêu cầu đã được ghi nhận nhưng việc chấm bài chưa hoàn
    // tất (đúng ngữ nghĩa hơn 201 Created ở đây, vì "kết quả" thật sự chưa
    // sẵn sàng).
    return HttpResponse.json(gradingResult, { status: 202 });
  }),

  // GET /api/teams/:teamId/grading/history — Requirement 6.6
  http.get('/api/teams/:teamId/grading/history', ({ params }) => {
    const teamId = params.teamId as string;

    const team = getDb().teams.find((t) => t.teamId === teamId);
    if (!team) {
      return errorResponse(new NotFoundError('Team', teamId));
    }

    // Property 4 (design.md): không xoá/ghi đè lịch sử — trả về TOÀN BỘ
    // lượt chấm của nhóm. `GradingResult` không có field `createdAt` riêng
    // (không thêm field mới vào shared-types ngoài phạm vi task này) nên
    // dùng thứ tự chèn vào mảng `gradingResults` làm thứ tự chronological —
    // luôn đúng vì lượt chấm chỉ được `push` (không bao giờ splice/reorder).
    const history = getDb().gradingResults.filter((g) => g.teamId === teamId);

    return HttpResponse.json(history, { status: 200 });
  }),

  // PATCH /api/teams/:teamId/grading/:gradingAttemptId/review — Requirement 7.3, 7.4, 7.5
  http.patch('/api/teams/:teamId/grading/:gradingAttemptId/review', async ({ params, request }) => {
    const teamId = params.teamId as string;
    const gradingAttemptId = params.gradingAttemptId as string;

    const team = getDb().teams.find((t) => t.teamId === teamId);
    if (!team) {
      return errorResponse(new NotFoundError('Team', teamId));
    }

    const gradingResult = getDb().gradingResults.find(
      (g) => g.teamId === teamId && g.gradingAttemptId === gradingAttemptId,
    );
    if (!gradingResult) {
      return errorResponse(new NotFoundError('GradingResult', gradingAttemptId));
    }

    const body = await request.json().catch(() => null);
    const reviewedByRaw = (body as { reviewedBy?: unknown } | null)?.reviewedBy;
    const finalScoreRaw = (body as { finalScore?: unknown } | null)?.finalScore;

    if (typeof reviewedByRaw !== 'string' || reviewedByRaw.trim().length === 0) {
      return errorResponse(new ValidationError('Thiếu reviewedBy.', 'reviewedBy'));
    }
    if (
      finalScoreRaw !== undefined &&
      (typeof finalScoreRaw !== 'number' || Number.isNaN(finalScoreRaw))
    ) {
      return errorResponse(new ValidationError('finalScore phải là số.', 'finalScore'));
    }

    // Requirement 7.3, 7.4, 7.5, Property 5 (design.md): `score` gốc của AI
    // KHÔNG bao giờ bị chạm tới ở đây. `finalScore` là field riêng — chỉ
    // set khi Admin thực sự gửi lên (Admin sửa điểm); nếu Admin chỉ xác
    // nhận giữ nguyên điểm AI (không gửi `finalScore`), field này giữ
    // nguyên giá trị hiện có (thường là `undefined`) — UI/export sẽ tự ưu
    // tiên hiển thị `finalScore` nếu có, ngược lại `score` (Requirement 7.6).
    gradingResult.reviewStatus = 'REVIEWED';
    gradingResult.reviewedBy = reviewedByRaw.trim();
    if (finalScoreRaw !== undefined) {
      gradingResult.finalScore = finalScoreRaw;
    }

    saveDb();

    return HttpResponse.json(gradingResult, { status: 200 });
  }),
];
