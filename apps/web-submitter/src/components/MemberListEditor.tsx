/**
 * `MemberListEditor` — danh sách thành viên nhóm, thêm/xoá động (task 5.3).
 *
 * Dùng Cloudscape `AttributeEditor`: đây đúng là component được thiết kế cho
 * dạng "danh sách dòng nhập thêm/xoá được", nên có sẵn nút thêm ở cuối, nút
 * xoá theo dòng, và chỗ hiển thị lỗi cho từng ô — không cần tự dựng lại.
 *
 * Component này là **controlled + không tự validate**: nó nhận `members` và
 * `errors` từ ngoài rồi báo thay đổi qua `onChange`. Lý do: thời điểm hiện
 * lỗi là quyết định của form (task 5.5 hiện lỗi khi bấm nộp, chứ không phải
 * ngay khi người dùng vừa gõ ký tự đầu), còn quy tắc validate nằm ở
 * `src/validation.ts` để cả form và component dùng chung 1 nguồn.
 *
 * Mapping yêu cầu:
 *   - 2.2: 3 ô mỗi dòng — tên (bắt buộc), email (bắt buộc), MSSV (tuỳ chọn,
 *     được ghi rõ "tuỳ chọn" trên nhãn).
 *   - 2.3: nút "+ Thêm sinh viên" không giới hạn số dòng; không cho xoá dòng
 *     cuối cùng để luôn còn tối thiểu 1 thành viên.
 *   - 2.4: nút xoá loại bỏ đúng dòng đó khỏi form trước khi nộp.
 *
 * _Requirements: 2.2, 2.3, 2.4_
 */
import { useCallback } from 'react';
import AttributeEditor from '@cloudscape-design/components/attribute-editor';
import Input from '@cloudscape-design/components/input';
import type { MemberDraft, MemberErrorMap } from '../validation';
import { createEmptyMember } from '../validation';

export interface MemberListEditorProps {
  /** Danh sách thành viên đang nhập (state do form sở hữu). */
  members: MemberDraft[];
  /** Lỗi theo `localId` của từng dòng; `{}` nghĩa là chưa validate / không lỗi. */
  errors: MemberErrorMap;
  /** Vô hiệu hoá toàn bộ ô nhập + nút (ví dụ trong lúc đang gửi request). */
  disabled?: boolean;
  /** Báo danh sách mới cho form sau mỗi lần sửa / thêm / xoá. */
  onChange: (members: MemberDraft[]) => void;
}

export function MemberListEditor({
  members,
  errors,
  disabled = false,
  onChange,
}: MemberListEditorProps) {
  /** Cập nhật 1 field của 1 dòng, giữ nguyên các dòng khác. */
  const updateMember = useCallback(
    (localId: string, patch: Partial<Omit<MemberDraft, 'localId'>>) => {
      onChange(
        members.map((member) => (member.localId === localId ? { ...member, ...patch } : member)),
      );
    },
    [members, onChange],
  );

  const addMember = useCallback(() => {
    // Requirement 2.3: không giới hạn số thành viên.
    onChange([...members, createEmptyMember()]);
  }, [members, onChange]);

  const removeMember = useCallback(
    (itemIndex: number) => {
      // Requirement 2.4: loại bỏ đúng dòng được chọn khỏi form.
      onChange(members.filter((_, index) => index !== itemIndex));
    },
    [members, onChange],
  );

  return (
    <AttributeEditor
      items={members}
      addButtonText="+ Thêm sinh viên"
      removeButtonText="Xoá"
      onAddButtonClick={addMember}
      onRemoveButtonClick={({ detail }) => removeMember(detail.itemIndex)}
      // Requirement 2.3: nhóm phải còn tối thiểu 1 thành viên -> dòng duy
      // nhất còn lại không được xoá. Chặn ngay ở đây rõ ràng hơn là để người
      // dùng xoá hết rồi mới báo lỗi khi nộp.
      //
      // Lưu ý hành vi Cloudscape: khi hàm này trả `false`, nút xoá bị ẨN HẲN
      // (không phải render ra rồi disable).
      isItemRemovable={() => members.length > 1}
      removeButtonAriaLabel={(item) => {
        const position = members.indexOf(item) + 1;
        const name = item.memberName.trim();
        return name.length > 0
          ? `Xoá thành viên ${name}`
          : `Xoá thành viên thứ ${position.toString()}`;
      }}
      definition={[
        {
          label: 'Tên sinh viên',
          errorText: (item) => errors[item.localId]?.memberName,
          control: (item) => {
            const position = members.indexOf(item) + 1;
            return (
              <Input
                value={item.memberName}
                disabled={disabled}
                placeholder="Nguyễn Văn An"
                // Nhãn cột chỉ hiện 1 lần cho cả danh sách, nên từng ô cần
                // aria-label riêng kèm số thứ tự dòng để screen reader (và
                // test) phân biệt được các ô cùng loại.
                ariaLabel={`Tên sinh viên của thành viên thứ ${position.toString()}`}
                onChange={({ detail }) => updateMember(item.localId, { memberName: detail.value })}
              />
            );
          },
        },
        {
          label: 'Email',
          errorText: (item) => errors[item.localId]?.email,
          control: (item) => {
            const position = members.indexOf(item) + 1;
            return (
              <Input
                value={item.email}
                disabled={disabled}
                // CỐ TÌNH KHÔNG dùng `type="email"`. Với `type="email"`, giá
                // trị sai định dạng làm constraint validation của trình duyệt
                // CHẶN luôn sự kiện submit của form: `handleSubmit` không chạy,
                // nên lỗi Cloudscape của ta không bao giờ hiện và người dùng
                // chỉ thấy tooltip mặc định của trình duyệt — trái với
                // design.md > Error Handling (lỗi hiển thị qua Cloudscape, UI
                // tự kiểm soát thông báo). `inputMode="email"` vẫn giữ được
                // bàn phím phù hợp trên thiết bị di động.
                inputMode="email"
                placeholder="an.nguyen@example.com"
                ariaLabel={`Email của thành viên thứ ${position.toString()}`}
                onChange={({ detail }) => updateMember(item.localId, { email: detail.value })}
              />
            );
          },
        },
        {
          // Requirement 2.2: MSSV tuỳ chọn -> nói rõ trên nhãn để người nhập
          // không tưởng là bắt buộc.
          label: 'MSSV (tuỳ chọn)',
          control: (item) => {
            const position = members.indexOf(item) + 1;
            return (
              <Input
                value={item.studentCode}
                disabled={disabled}
                placeholder="SV001"
                ariaLabel={`MSSV của thành viên thứ ${position.toString()} (tuỳ chọn)`}
                onChange={({ detail }) => updateMember(item.localId, { studentCode: detail.value })}
              />
            );
          },
        },
      ]}
      empty='Chưa có thành viên nào. Bấm "+ Thêm sinh viên" để thêm.'
    />
  );
}
