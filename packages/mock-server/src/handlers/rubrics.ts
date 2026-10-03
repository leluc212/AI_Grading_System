/**
 * MSW handler cho domain Rubric (task 3.9) — `getActiveRubric`,
 * `listRubricVersions`, `saveRubric`.
 *
 * Endpoint tương ứng các hàm service layer `rubricsApi` mô tả ở design.md >
 * API Contract (Service Layer):
 *   - GET  /api/rubrics/active -> getActiveRubric()
 *   - GET  /api/rubrics        -> listRubricVersions()
 *   - POST /api/rubrics        -> saveRubric(input)
 *
 * Lỗi trả về theo format `{ code, message }` (xem design.md > Error
 * Handling), tái dùng trực tiếp typed error class ở `shared-types`.
 *
 * _Requirements: 9.1, 9.2, 9.4_
 */
import { http, HttpResponse } from 'msw';
import type { Rubric, RubricCriterion } from '@quick-grading/shared-types';
import { DomainError, ValidationError } from '@quick-grading/shared-types';
import { getDb, saveDb } from '../db.js';

/** Chuyển 1 typed `DomainError` thành response `{ code, message }` đúng httpStatus của nó */
function errorResponse(error: DomainError) {
  return HttpResponse.json(
    { code: error.code, message: error.message },
    { status: error.httpStatus },
  );
}

/** Body chấp nhận khi lưu rubric mới */
interface SaveRubricBody {
  criteria?: unknown;
}

/**
 * Validate `criteria` gửi lên từ Admin (Requirement 9.1 — cấu trúc chi tiết
 * để trống, chỉ validate tối thiểu ở đây): phải là array không rỗng, mỗi
 * phần tử có `id`/`label` dạng string không rỗng, `weight` (nếu có) phải là
 * number. Trả về mảng `RubricCriterion` đã validate hoặc throw
 * `ValidationError`.
 */
function validateCriteria(raw: unknown): RubricCriterion[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError('criteria phải là một mảng không rỗng.', 'criteria');
  }

  return raw.map((item, index) => {
    if (typeof item !== 'object' || item === null) {
      throw new ValidationError(`criteria[${index}] không hợp lệ.`, 'criteria');
    }
    const { id, label, weight } = item as Record<string, unknown>;

    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new ValidationError(`criteria[${index}].id là bắt buộc (string).`, 'criteria');
    }
    if (typeof label !== 'string' || label.trim().length === 0) {
      throw new ValidationError(
        `criteria[${index}].label là bắt buộc (string, không rỗng).`,
        'criteria',
      );
    }
    if (weight !== undefined && typeof weight !== 'number') {
      throw new ValidationError(`criteria[${index}].weight phải là số nếu có.`, 'criteria');
    }

    const criterion: RubricCriterion = { id, label };
    if (weight !== undefined) {
      criterion.weight = weight;
    }
    return criterion;
  });
}

export const rubricHandlers = [
  // GET /api/rubrics/active — Requirement 9.4: chỉ rubric isActive = true
  // được dùng khi trigger chấm bài mới. Trả `null` (200) nếu chưa có rubric
  // nào active — design.md khai báo rõ signature `Promise<Rubric | null>`
  // nên KHÔNG 404 ở đây, để service layer phân biệt được "chưa cấu hình
  // rubric" (null, hợp lệ) với lỗi hệ thống.
  http.get('/api/rubrics/active', () => {
    const active = getDb().rubrics.find((r) => r.isActive) ?? null;
    return HttpResponse.json(active, { status: 200 });
  }),

  // GET /api/rubrics — Requirement 9.2: liệt kê toàn bộ phiên bản rubric
  // (không xoá bản cũ). Sắp xếp tăng dần theo `version` để UI (task 10.1)
  // hiển thị lịch sử theo đúng thứ tự thời gian mà không cần tự sort lại.
  http.get('/api/rubrics', () => {
    const versions = [...getDb().rubrics].sort((a, b) => a.version - b.version);
    return HttpResponse.json(versions, { status: 200 });
  }),

  // POST /api/rubrics — Requirement 9.1, 9.2, 9.4
  http.post('/api/rubrics', async ({ request }) => {
    const body = (await request.json().catch(() => ({}))) as SaveRubricBody;

    let criteria: RubricCriterion[];
    try {
      criteria = validateCriteria(body.criteria);
    } catch (err) {
      if (err instanceof DomainError) {
        return errorResponse(err);
      }
      throw err;
    }

    const rubrics = getDb().rubrics;

    // Requirement 9.2: tăng version dựa trên version lớn nhất hiện có (0
    // nếu chưa có rubric nào), KHÔNG xoá/ghi đè các bản cũ.
    const maxVersion = rubrics.reduce((max, r) => Math.max(max, r.version), 0);
    const now = new Date().toISOString();

    // Requirement 9.4: "chỉ rubric đang isActive = true SHALL được dùng khi
    // Admin trigger chấm bài mới" — kết hợp với việc versioning giữ lại bản
    // cũ (9.2), cách hiểu hợp lý duy nhất là tại một thời điểm chỉ có ĐÚNG 1
    // rubric active (giống pattern single-active-record đã dùng cho Team
    // status: 1 team chỉ ở đúng 1 status tại một thời điểm). Vì vậy rubric
    // mới lưu luôn trở thành active, và mọi rubric khác bị deactivate —
    // các bản ghi này vẫn được giữ lại (không xoá) để tra cứu lịch sử qua
    // `listRubricVersions`, chỉ không còn được dùng cho lượt chấm mới.
    rubrics.forEach((r) => {
      r.isActive = false;
    });

    const newRubric: Rubric = {
      rubricId: crypto.randomUUID(),
      version: maxVersion + 1,
      criteria,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    rubrics.push(newRubric);
    saveDb();

    return HttpResponse.json(newRubric, { status: 201 });
  }),
];
