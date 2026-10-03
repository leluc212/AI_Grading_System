/**
 * Dữ liệu đang nhập + quy tắc validate của form cấu hình rubric (task 10.1).
 *
 * Tách khỏi component vì cùng lý do như `web-submitter/src/validation.ts`:
 * quy tắc nghiệp vụ cần kiểm thử được mà không phải dựng DOM, và form dùng
 * chung 1 nguồn quy tắc với phần hiển thị lỗi inline.
 *
 * Phạm vi CỐ Ý tối thiểu: Requirement 9.1 nói rõ cấu trúc chi tiết của rubric
 * "có thể để trống ở phiên bản đầu", và `RubricCriterion` ở `shared-types`
 * hiện chỉ có `id` / `label` / `weight?`. Nên ở đây không bịa thêm field nào
 * (mô tả, thang điểm con, reviewFlagRules...) — thêm vào lúc này sẽ phải
 * tháo ra khi cấu trúc thật được chốt.
 *
 * _Requirements: 9.1, 9.2_
 */
import type { RubricCriterion } from '@quick-grading/shared-types';
import { RUBRIC_WEIGHT_PERCENT, isWeightInScale } from '@quick-grading/shared-types';

/**
 * Một dòng tiêu chí đang nhập trên form.
 *
 * Khác `RubricCriterion` ở 2 điểm:
 *   - `localId`: khoá React + khoá tra lỗi theo dòng. KHÁC `id` vì `id` là
 *     dữ liệu thật được gửi lên server và phải giữ nguyên khi sửa tiêu chí cũ
 *     (để lượt chấm trước còn tham chiếu đúng), còn `localId` chỉ sống trong
 *     phiên làm việc này.
 *   - `weightText` là `string` (không phải `number | undefined`) vì ô input
 *     luôn trả chuỗi; việc chuyển sang số chỉ xảy ra ở `toRubricCriteria`.
 */
export interface CriterionDraft {
  localId: string;
  id: string;
  label: string;
  weightText: string;
}

/** Bộ đếm dự phòng khi môi trường không có `crypto.randomUUID`. */
let fallbackIdCounter = 0;

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  fallbackIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackIdCounter}`;
}

/** Tạo 1 dòng tiêu chí trống. `id` sinh sẵn vì server yêu cầu `id` không rỗng. */
export function createEmptyCriterion(): CriterionDraft {
  return { localId: createId('local'), id: createId('c'), label: '', weightText: '' };
}

/**
 * Chuyển rubric đang active thành dữ liệu form để Admin sửa.
 *
 * GIỮ NGUYÊN `id` của từng tiêu chí: lượt chấm cũ ghi lại `rubricVersion` và
 * (ở giai đoạn 3) sẽ tham chiếu tiêu chí theo `id`, nên sinh id mới khi sửa sẽ
 * làm mất liên kết đó.
 */
export function toCriterionDrafts(criteria: RubricCriterion[]): CriterionDraft[] {
  return criteria.map((criterion) => ({
    localId: createId('local'),
    id: criterion.id,
    label: criterion.label,
    weightText: criterion.weight === undefined ? '' : String(criterion.weight),
  }));
}

export interface CriterionFieldErrors {
  label?: string;
  weight?: string;
}

/** Map lỗi theo `localId` của từng dòng tiêu chí. */
export type CriterionErrorMap = Record<string, CriterionFieldErrors>;

/**
 * Thang trọng số lấy từ `@quick-grading/shared-types`.
 *
 * Trọng số là PHẦN TRĂM nên độc lập với thang điểm (`GRADING_SCALE`): đổi thang
 * điểm sang 0-10 thì trọng số vẫn là 0-100%. Server chỉ kiểm
 * `typeof weight === 'number'` nên ràng buộc khoảng ở đây là phần UI chặn lỗi
 * gõ sai.
 */
const { min: MIN_WEIGHT, max: MAX_WEIGHT } = RUBRIC_WEIGHT_PERCENT;

/** Tổng trọng số mong đợi; lệch thì form chỉ CẢNH BÁO, không chặn lưu. */
export const EXPECTED_TOTAL_WEIGHT = RUBRIC_WEIGHT_PERCENT.expectedTotal;

/** Validate 1 dòng tiêu chí. */
export function validateCriterion(draft: CriterionDraft): CriterionFieldErrors {
  const errors: CriterionFieldErrors = {};

  if (draft.label.trim().length === 0) {
    errors.label = 'Tên tiêu chí không được để trống.';
  }

  const raw = draft.weightText.trim();
  if (raw.length > 0) {
    // `Number()` chặt hơn `parseFloat`: `parseFloat('60abc')` cho 60, ở đây
    // phải là số thuần mới được nhận.
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      errors.weight = 'Trọng số phải là một số.';
    } else if (!isWeightInScale(parsed)) {
      errors.weight = `Trọng số phải nằm trong khoảng ${MIN_WEIGHT} - ${MAX_WEIGHT}.`;
    }
  }

  // Trọng số để trống là hợp lệ: `RubricCriterion.weight` là field optional.
  return errors;
}

/** Validate toàn bộ danh sách; dòng hợp lệ KHÔNG xuất hiện trong map. */
export function validateCriteriaDrafts(drafts: CriterionDraft[]): CriterionErrorMap {
  const errorMap: CriterionErrorMap = {};
  for (const draft of drafts) {
    const errors = validateCriterion(draft);
    if (Object.keys(errors).length > 0) {
      errorMap[draft.localId] = errors;
    }
  }
  return errorMap;
}

export function hasCriterionErrors(errorMap: CriterionErrorMap): boolean {
  return Object.keys(errorMap).length > 0;
}

/**
 * Chuyển dữ liệu form thành payload cho `rubricsApi.saveRubric`.
 *
 * Cắt khoảng trắng ở `label`, và chỉ gửi `weight` khi Admin thực sự nhập —
 * gửi `weight: 0` cho ô để trống sẽ biến "không đặt trọng số" thành "trọng số
 * bằng 0", hai thứ khác nhau.
 */
export function toRubricCriteria(drafts: CriterionDraft[]): RubricCriterion[] {
  return drafts.map((draft) => {
    const raw = draft.weightText.trim();
    const criterion: RubricCriterion = { id: draft.id, label: draft.label.trim() };
    if (raw.length > 0) {
      criterion.weight = Number(raw);
    }
    return criterion;
  });
}

/** Tổng trọng số của các dòng đã nhập (bỏ qua ô trống và ô không phải số). */
export function sumWeights(drafts: CriterionDraft[]): number {
  return drafts.reduce((total, draft) => {
    const parsed = Number(draft.weightText.trim());
    return draft.weightText.trim().length > 0 && Number.isFinite(parsed) ? total + parsed : total;
  }, 0);
}
