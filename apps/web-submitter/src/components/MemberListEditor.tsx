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
import { useCallback, useMemo } from 'react';
import type { AttributeEditorProps } from '@cloudscape-design/components/attribute-editor';
import AttributeEditor from '@cloudscape-design/components/attribute-editor';
import Input from '@cloudscape-design/components/input';
import { useLanguage } from '../i18n/LanguageContext';
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
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly onChange: (localId: string, value: string) => void;
}

function MemberNameControl({
  item,
  disabled,
  placeholder,
  ariaLabel,
  onChange,
}: MemberControlProps) {
  return (
    <Input
      value={item.memberName}
      disabled={disabled}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      onChange={({ detail }) => onChange(item.localId, detail.value)}
    />
  );
}

function MemberEmailControl({
  item,
  disabled,
  placeholder,
  ariaLabel,
  onChange,
}: MemberControlProps) {
  return (
    <Input
      value={item.email}
      disabled={disabled}
      inputMode="email"
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      onChange={({ detail }) => onChange(item.localId, detail.value)}
    />
  );
}

function MemberStudentCodeControl({
  item,
  disabled,
  placeholder,
  ariaLabel,
  onChange,
}: MemberControlProps) {
  const hasValue = item.studentCode.trim().length > 0;
  return (
    <div className={`fcaj-mssv-input ${hasValue ? 'has-value' : ''}`}>
      <Input
        value={item.studentCode}
        disabled={disabled}
        placeholder={placeholder}
        ariaLabel={ariaLabel}
        onChange={({ detail }) => onChange(item.localId, detail.value)}
      />
    </div>
  );
}

interface MemberFieldLabels {
  nameLabel: string;
  namePlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  codeLabel: string;
  codePlaceholder: string;
  isVi: boolean;
}

function buildMemberDefinitions(
  members: readonly MemberDraft[],
  errors: MemberErrorMap,
  disabled: boolean,
  labels: MemberFieldLabels,
  handleNameChange: (localId: string, memberName: string) => void,
  handleEmailChange: (localId: string, email: string) => void,
  handleStudentCodeChange: (localId: string, studentCode: string) => void,
): AttributeEditorProps.FieldDefinition<MemberDraft>[] {
  return [
    {
      label: (
        <span>
          <span>{labels.nameLabel}</span>
          <span className="fcaj-required-star">*</span>
        </span>
      ),
      errorText: (item) => errors[item.localId]?.memberName,
      control: (item) => {
        const pos = members.indexOf(item) + 1;
        return (
          <MemberNameControl
            item={item}
            position={pos}
            disabled={disabled}
            placeholder={labels.namePlaceholder}
            ariaLabel={
              labels.isVi
                ? `Tên sinh viên của thành viên thứ ${pos.toString()}`
                : `Student name for member ${pos.toString()}`
            }
            onChange={handleNameChange}
          />
        );
      },
    },
    {
      label: (
        <span>
          <span>{labels.emailLabel}</span>
          <span className="fcaj-required-star">*</span>
        </span>
      ),
      errorText: (item) => errors[item.localId]?.email,
      control: (item) => {
        const pos = members.indexOf(item) + 1;
        return (
          <MemberEmailControl
            item={item}
            position={pos}
            disabled={disabled}
            placeholder={labels.emailPlaceholder}
            ariaLabel={
              labels.isVi
                ? `Email của thành viên thứ ${pos.toString()}`
                : `Email for member ${pos.toString()}`
            }
            onChange={handleEmailChange}
          />
        );
      },
    },
    {
      label: labels.codeLabel,
      control: (item) => {
        const pos = members.indexOf(item) + 1;
        return (
          <MemberStudentCodeControl
            item={item}
            position={pos}
            disabled={disabled}
            placeholder={labels.codePlaceholder}
            ariaLabel={
              labels.isVi
                ? `MSSV của thành viên thứ ${pos.toString()}`
                : `Student ID for member ${pos.toString()}`
            }
            onChange={handleStudentCodeChange}
          />
        );
      },
    },
  ];
}

export function MemberListEditor({
  members,
  errors,
  disabled = false,
  onChange,
}: MemberListEditorProps) {
  const { t, language } = useLanguage();
  const isVi = language === 'vi';

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

  const labels = useMemo<MemberFieldLabels>(
    () => ({
      nameLabel: t('studentNameLabel'),
      namePlaceholder: t('studentNamePlaceholder'),
      emailLabel: t('emailLabel'),
      emailPlaceholder: t('emailPlaceholder'),
      codeLabel: t('studentCodeLabel'),
      codePlaceholder: t('studentCodePlaceholder'),
      isVi,
    }),
    [t, isVi],
  );

  const definitions = useMemo(
    () =>
      buildMemberDefinitions(
        members,
        errors,
        disabled,
        labels,
        handleNameChange,
        handleEmailChange,
        handleStudentCodeChange,
      ),
    [
      members,
      errors,
      disabled,
      labels,
      handleNameChange,
      handleEmailChange,
      handleStudentCodeChange,
    ],
  );

  return (
    <AttributeEditor
      items={members as MemberDraft[]}
      addButtonText={t('btnAddMember')}
      removeButtonText={t('btnRemoveMember')}
      onAddButtonClick={addMember}
      onRemoveButtonClick={({ detail }) => removeMember(detail.itemIndex)}
      isItemRemovable={() => members.length > 1}
      removeButtonAriaLabel={(item) => {
        const position = members.indexOf(item) + 1;
        const name = item.memberName.trim();
        if (isVi) {
          return name.length > 0
            ? `Xoá thành viên ${name}`
            : `Xoá thành viên thứ ${position.toString()}`;
        }
        return name.length > 0 ? `Remove member ${name}` : `Remove member ${position.toString()}`;
      }}
      definition={definitions}
      empty={t('emptyMembers')}
    />
  );
}
