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
  readonly members: readonly MemberDraft[];
  /** Lỗi theo `localId` của từng dòng; `{}` nghĩa là chưa validate / không lỗi. */
  readonly errors: MemberErrorMap;
  /** Vô hiệu hoá toàn bộ ô nhập + nút (ví dụ trong lúc đang gửi request). */
  readonly disabled?: boolean;
  /** Báo danh sách mới cho form sau mỗi lần sửa / thêm / xoá. */
  readonly onChange: (members: MemberDraft[]) => void;
}

interface MemberControlProps {
  readonly item: MemberDraft;
  readonly position: number;
  readonly disabled: boolean;
  readonly onChange: (localId: string, value: string) => void;
}

function MemberNameControl({ item, position, disabled, onChange }: MemberControlProps) {
  return (
    <Input
      value={item.memberName}
      disabled={disabled}
      placeholder="Nguyễn Văn An"
      ariaLabel={`Tên sinh viên của thành viên thứ ${position.toString()}`}
      onChange={({ detail }) => onChange(item.localId, detail.value)}
    />
  );
}

function MemberEmailControl({ item, position, disabled, onChange }: MemberControlProps) {
  return (
    <Input
      value={item.email}
      disabled={disabled}
      inputMode="email"
      placeholder="an.nguyen@example.com"
      ariaLabel={`Email của thành viên thứ ${position.toString()}`}
      onChange={({ detail }) => onChange(item.localId, detail.value)}
    />
  );
}

function MemberStudentCodeControl({ item, position, disabled, onChange }: MemberControlProps) {
  return (
    <Input
      value={item.studentCode}
      disabled={disabled}
      placeholder="SV001"
      ariaLabel={`MSSV của thành viên thứ ${position.toString()} (tuỳ chọn)`}
      onChange={({ detail }) => onChange(item.localId, detail.value)}
    />
  );
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

  const handleNameChange = useCallback(
    (localId: string, memberName: string) => {
      updateMember(localId, { memberName });
    },
    [updateMember],
  );

  const handleEmailChange = useCallback(
    (localId: string, email: string) => {
      updateMember(localId, { email });
    },
    [updateMember],
  );

  const handleStudentCodeChange = useCallback(
    (localId: string, studentCode: string) => {
      updateMember(localId, { studentCode });
    },
    [updateMember],
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
      items={members as MemberDraft[]}
      addButtonText="+ Thêm sinh viên"
      removeButtonText="Xoá"
      onAddButtonClick={addMember}
      onRemoveButtonClick={({ detail }) => removeMember(detail.itemIndex)}
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
          control: (item) => (
            <MemberNameControl
              item={item}
              position={members.indexOf(item) + 1}
              disabled={disabled}
              onChange={handleNameChange}
            />
          ),
        },
        {
          label: 'Email',
          errorText: (item) => errors[item.localId]?.email,
          control: (item) => (
            <MemberEmailControl
              item={item}
              position={members.indexOf(item) + 1}
              disabled={disabled}
              onChange={handleEmailChange}
            />
          ),
        },
        {
          label: 'MSSV (tuỳ chọn)',
          control: (item) => (
            <MemberStudentCodeControl
              item={item}
              position={members.indexOf(item) + 1}
              disabled={disabled}
              onChange={handleStudentCodeChange}
            />
          ),
        },
      ]}
      empty='Chưa có thành viên nào. Bấm "+ Thêm sinh viên" để thêm.'
    />
  );
}
