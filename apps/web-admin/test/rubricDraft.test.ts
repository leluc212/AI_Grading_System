/**
 * Unit test cho quy tắc dữ liệu/validate của form rubric (task 10.1).
 *
 * Kiểm ở mức hàm thuần vì đây là nghiệp vụ (Requirement 9.1, 9.2) và phải đúng
 * độc lập với việc UI render thế nào.
 */
import { describe, expect, it } from 'vitest';
import type { RubricCriterion } from '@quick-grading/shared-types';
import type { CriterionDraft } from '../src/rubricDraft';
import {
  createEmptyCriterion,
  hasCriterionErrors,
  sumWeights,
  toCriterionDrafts,
  toRubricCriteria,
  validateCriteriaDrafts,
  validateCriterion,
} from '../src/rubricDraft';

function makeDraft(overrides: Partial<CriterionDraft> = {}): CriterionDraft {
  return {
    localId: 'local-1',
    id: 'c-1',
    label: 'Tính đúng đắn',
    weightText: '60',
    ...overrides,
  };
}

describe('createEmptyCriterion', () => {
  it('tạo dòng trống với localId và id duy nhất', () => {
    const first = createEmptyCriterion();
    const second = createEmptyCriterion();

    expect(first.label).toBe('');
    expect(first.weightText).toBe('');
    expect(first.localId).not.toBe(second.localId);
    // `id` phải có sẵn vì server từ chối criterion không có `id`.
    expect(first.id.length).toBeGreaterThan(0);
    expect(first.id).not.toBe(second.id);
  });
});

describe('toCriterionDrafts', () => {
  it('giữ nguyên id của tiêu chí cũ', () => {
    const criteria: RubricCriterion[] = [
      { id: 'c1', label: 'Tính đúng đắn', weight: 60 },
      { id: 'c2', label: 'Trình bày' },
    ];

    const drafts = toCriterionDrafts(criteria);

    // Lượt chấm cũ ghi lại rubricVersion và (giai đoạn 3) tham chiếu tiêu chí
    // theo `id` -> sinh id mới khi sửa sẽ làm mất liên kết đó.
    expect(drafts.map((d) => d.id)).toEqual(['c1', 'c2']);
    expect(drafts[0].weightText).toBe('60');
    // Trọng số không có -> ô để trống, không phải chuỗi "undefined".
    expect(drafts[1].weightText).toBe('');
  });

  it('sinh localId riêng cho từng dòng', () => {
    const drafts = toCriterionDrafts([
      { id: 'c1', label: 'A' },
      { id: 'c2', label: 'B' },
    ]);

    expect(drafts[0].localId).not.toBe(drafts[1].localId);
  });
});

describe('validateCriterion', () => {
  it('không báo lỗi với tiêu chí hợp lệ', () => {
    expect(validateCriterion(makeDraft())).toEqual({});
  });

  it('bắt buộc tên tiêu chí', () => {
    expect(validateCriterion(makeDraft({ label: '' })).label).toBe(
      'Tên tiêu chí không được để trống.',
    );
    expect(validateCriterion(makeDraft({ label: '   ' })).label).toBeDefined();
  });

  it('cho phép để trống trọng số (field optional)', () => {
    expect(validateCriterion(makeDraft({ weightText: '' }))).toEqual({});
    expect(validateCriterion(makeDraft({ weightText: '  ' }))).toEqual({});
  });

  it('từ chối trọng số không phải số', () => {
    expect(validateCriterion(makeDraft({ weightText: 'abc' })).weight).toBe(
      'Trọng số phải là một số.',
    );
    // `Number('60abc')` ra NaN -> bị chặn (khác `parseFloat` vốn trả 60).
    expect(validateCriterion(makeDraft({ weightText: '60abc' })).weight).toBeDefined();
  });

  it('từ chối trọng số ngoài khoảng 0 - 100', () => {
    expect(validateCriterion(makeDraft({ weightText: '-1' })).weight).toBeDefined();
    expect(validateCriterion(makeDraft({ weightText: '101' })).weight).toBeDefined();
  });

  it('chấp nhận trọng số ở biên 0 và 100', () => {
    expect(validateCriterion(makeDraft({ weightText: '0' })).weight).toBeUndefined();
    expect(validateCriterion(makeDraft({ weightText: '100' })).weight).toBeUndefined();
  });
});

describe('validateCriteriaDrafts / hasCriterionErrors', () => {
  it('chỉ đưa vào map những dòng đang lỗi, khoá theo localId', () => {
    const errorMap = validateCriteriaDrafts([
      makeDraft({ localId: 'ok' }),
      makeDraft({ localId: 'thieu-ten', label: '' }),
      makeDraft({ localId: 'trong-so-sai', weightText: 'abc' }),
    ]);

    expect(Object.keys(errorMap).sort()).toEqual(['thieu-ten', 'trong-so-sai']);
    expect(errorMap['ok']).toBeUndefined();
    expect(hasCriterionErrors(errorMap)).toBe(true);
  });

  it('trả map rỗng khi mọi dòng hợp lệ', () => {
    const errorMap = validateCriteriaDrafts([
      makeDraft({ localId: 'a' }),
      makeDraft({ localId: 'b', weightText: '40' }),
    ]);

    expect(errorMap).toEqual({});
    expect(hasCriterionErrors(errorMap)).toBe(false);
  });
});

describe('toRubricCriteria', () => {
  it('cắt khoảng trắng ở label và bỏ localId khỏi payload', () => {
    const [criterion] = toRubricCriteria([makeDraft({ label: '  Tính đúng đắn  ' })]);

    expect(criterion).toEqual({ id: 'c-1', label: 'Tính đúng đắn', weight: 60 });
    expect('localId' in criterion).toBe(false);
  });

  it('KHÔNG gửi weight khi ô để trống', () => {
    const [criterion] = toRubricCriteria([makeDraft({ weightText: '' })]);

    // Gửi `weight: 0` sẽ biến "không đặt trọng số" thành "trọng số bằng 0".
    expect('weight' in criterion).toBe(false);
  });

  it('gửi weight = 0 khi Admin thực sự nhập 0', () => {
    const [criterion] = toRubricCriteria([makeDraft({ weightText: '0' })]);

    expect(criterion.weight).toBe(0);
  });

  it('giữ nguyên thứ tự tiêu chí', () => {
    const payload = toRubricCriteria([
      makeDraft({ localId: '1', id: 'c1', label: 'A' }),
      makeDraft({ localId: '2', id: 'c2', label: 'B' }),
      makeDraft({ localId: '3', id: 'c3', label: 'C' }),
    ]);

    expect(payload.map((c) => c.label)).toEqual(['A', 'B', 'C']);
  });
});

describe('sumWeights', () => {
  it('cộng các trọng số đã nhập', () => {
    expect(sumWeights([makeDraft({ weightText: '60' }), makeDraft({ weightText: '40' })])).toBe(
      100,
    );
  });

  it('bỏ qua ô trống và ô không phải số', () => {
    expect(
      sumWeights([
        makeDraft({ weightText: '60' }),
        makeDraft({ weightText: '' }),
        makeDraft({ weightText: 'abc' }),
      ]),
    ).toBe(60);
  });

  it('trả 0 khi không có dòng nào', () => {
    expect(sumWeights([])).toBe(0);
  });
});
