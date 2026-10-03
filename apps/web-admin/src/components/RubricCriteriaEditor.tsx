/**
 * `RubricCriteriaEditor` — danh sách tiêu chí rubric, thêm/xoá/sửa động
 * (phần editor của task 10.1).
 *
 * Dùng Cloudscape `AttributeEditor` (giống `MemberListEditor` ở
 * `web-submitter`): đây là component dành cho dạng danh sách dòng nhập
 * thêm/xoá được, có sẵn nút thêm, nút xoá theo dòng và chỗ hiện lỗi từng ô.
 *
 * Controlled và KHÔNG tự validate: thời điểm hiện lỗi do trang quyết định
 * (validate khi bấm Lưu, không phải khi đang gõ), còn quy tắc nằm ở
 * `src/rubricDraft.ts` để trang và component dùng chung 1 nguồn.
 *
 * _Requirements: 9.1_
 */
import { useCallback } from 'react';
import AttributeEditor from '@cloudscape-design/components/attribute-editor';
import Input from '@cloudscape-design/components/input';
import type { CriterionDraft, CriterionErrorMap } from '../rubricDraft';
import { createEmptyCriterion } from '../rubricDraft';

export interface RubricCriteriaEditorProps {
  criteria: CriterionDraft[];
  errors: CriterionErrorMap;
  disabled?: boolean;
  onChange: (criteria: CriterionDraft[]) => void;
}

export function RubricCriteriaEditor({
  criteria,
  errors,
  disabled = false,
  onChange,
}: RubricCriteriaEditorProps) {
  const updateCriterion = useCallback(
    (localId: string, patch: Partial<Omit<CriterionDraft, 'localId' | 'id'>>) => {
      onChange(criteria.map((item) => (item.localId === localId ? { ...item, ...patch } : item)));
    },
    [criteria, onChange],
  );

  return (
    <AttributeEditor
      items={criteria}
      addButtonText="+ Thêm tiêu chí"
      removeButtonText="Xoá"
      onAddButtonClick={() => onChange([...criteria, createEmptyCriterion()])}
      onRemoveButtonClick={({ detail }) =>
        onChange(criteria.filter((_, index) => index !== detail.itemIndex))
      }
      // Rubric phải có tối thiểu 1 tiêu chí (server từ chối `criteria` rỗng),
      // nên dòng cuối cùng không cho xoá. Lưu ý: khi hàm này trả `false`,
      // Cloudscape ẨN HẲN nút xoá thay vì render rồi disable.
      isItemRemovable={() => criteria.length > 1}
      removeButtonAriaLabel={(item) => {
        const label = item.label.trim();
        const position = criteria.indexOf(item) + 1;
        return label.length > 0
          ? `Xoá tiêu chí ${label}`
          : `Xoá tiêu chí thứ ${position.toString()}`;
      }}
      definition={[
        {
          label: 'Tên tiêu chí',
          errorText: (item) => errors[item.localId]?.label,
          control: (item) => {
            const position = criteria.indexOf(item) + 1;
            return (
              <Input
                value={item.label}
                disabled={disabled}
                placeholder="Tính đúng đắn"
                // Nhãn cột chỉ render 1 lần cho cả danh sách -> từng ô cần
                // aria-label riêng kèm số thứ tự để screen reader (và test)
                // phân biệt được.
                ariaLabel={`Tên tiêu chí thứ ${position.toString()}`}
                onChange={({ detail }) => updateCriterion(item.localId, { label: detail.value })}
              />
            );
          },
        },
        {
          label: 'Trọng số (tuỳ chọn)',
          errorText: (item) => errors[item.localId]?.weight,
          control: (item) => {
            const position = criteria.indexOf(item) + 1;
            return (
              <Input
                value={item.weightText}
                disabled={disabled}
                type="number"
                inputMode="decimal"
                placeholder="60"
                ariaLabel={`Trọng số của tiêu chí thứ ${position.toString()} (tuỳ chọn)`}
                onChange={({ detail }) =>
                  updateCriterion(item.localId, { weightText: detail.value })
                }
              />
            );
          },
        },
      ]}
      empty="Chưa có tiêu chí nào."
    />
  );
}
