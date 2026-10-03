/**
 * Component test cho `MemberListEditor` (task 5.3).
 *
 * Component là controlled nên test phải dựng 1 harness giữ state thật — nếu
 * render trực tiếp với props tĩnh thì bấm "thêm/xoá" sẽ không thay đổi gì và
 * test không kiểm được hành vi nào.
 *
 * Harness cũng có nút "Kiểm tra" gọi `validateMembers` để mô phỏng đúng cách
 * form thật sẽ dùng (validate khi nộp, không validate khi đang gõ) — nhờ đó
 * test được cả phần hiển thị lỗi inline.
 */
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemberListEditor } from '../src/components/MemberListEditor';
import {
  createEmptyMember,
  validateMembers,
  type MemberDraft,
  type MemberErrorMap,
} from '../src/validation';

function Harness({ initialMembers }: { initialMembers?: MemberDraft[] }) {
  const [members, setMembers] = useState<MemberDraft[]>(initialMembers ?? [createEmptyMember()]);
  const [errors, setErrors] = useState<MemberErrorMap>({});

  return (
    <>
      <MemberListEditor members={members} errors={errors} onChange={setMembers} />
      <button type="button" onClick={() => setErrors(validateMembers(members))}>
        Kiểm tra
      </button>
      <output data-testid="member-count">{members.length}</output>
    </>
  );
}

/** Ô "Tên sinh viên" của dòng thứ `position` (1-based). */
function nameInput(position: number): HTMLInputElement {
  return screen.getByLabelText(`Tên sinh viên của thành viên thứ ${position}`) as HTMLInputElement;
}

/** Ô "Email" của dòng thứ `position` (1-based). */
function emailInput(position: number): HTMLInputElement {
  return screen.getByLabelText(`Email của thành viên thứ ${position}`) as HTMLInputElement;
}

describe('MemberListEditor', () => {
  it('hiển thị 1 dòng thành viên với 3 ô: tên, email, MSSV (tuỳ chọn)', () => {
    render(<Harness />);

    expect(nameInput(1)).toBeDefined();
    expect(emailInput(1)).toBeDefined();
    expect(screen.getByLabelText('MSSV của thành viên thứ 1 (tuỳ chọn)')).toBeDefined();
    // Nhãn cột phải nói rõ MSSV là tuỳ chọn (Requirement 2.2).
    expect(screen.getByText('MSSV (tuỳ chọn)')).toBeDefined();
  });

  it('nút "+ Thêm sinh viên" thêm được nhiều dòng (Requirement 2.3)', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const addButton = screen.getByRole('button', { name: '+ Thêm sinh viên' });
    await user.click(addButton);
    await user.click(addButton);
    await user.click(addButton);

    expect(screen.getByTestId('member-count').textContent).toBe('4');
    expect(nameInput(4)).toBeDefined();
  });

  it('giữ dữ liệu đã nhập của các dòng cũ khi thêm dòng mới', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(nameInput(1), 'Nguyễn Văn An');
    await user.click(screen.getByRole('button', { name: '+ Thêm sinh viên' }));

    expect(nameInput(1).value).toBe('Nguyễn Văn An');
    expect(nameInput(2).value).toBe('');
  });

  it('không cho xoá khi chỉ còn 1 thành viên (tối thiểu 1 - Requirement 2.3)', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    // `isItemRemovable` trả false -> Cloudscape ẩn hẳn nút xoá (không phải
    // disable), nên dòng duy nhất không có cách nào bị xoá.
    expect(screen.queryByRole('button', { name: /^Xoá thành viên/ })).toBeNull();

    // Có từ 2 thành viên trở lên thì nút xoá xuất hiện lại.
    await user.click(screen.getByRole('button', { name: '+ Thêm sinh viên' }));
    expect(screen.getAllByRole('button', { name: /^Xoá thành viên/ })).toHaveLength(2);
  });

  it('xoá đúng thành viên được chọn và giữ lại các thành viên khác (Requirement 2.4)', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialMembers={[
          { localId: 'l1', memberName: 'An', email: 'an@example.com', studentCode: '' },
          { localId: 'l2', memberName: 'Bình', email: 'binh@example.com', studentCode: '' },
          { localId: 'l3', memberName: 'Châu', email: 'chau@example.com', studentCode: '' },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Xoá thành viên Bình' }));

    expect(screen.getByTestId('member-count').textContent).toBe('2');
    expect(nameInput(1).value).toBe('An');
    expect(nameInput(2).value).toBe('Châu');
    expect(screen.queryByRole('button', { name: 'Xoá thành viên Bình' })).toBeNull();
  });

  it('không hiển thị lỗi trong lúc người dùng đang gõ', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.type(emailInput(1), 'chua-phai-email');

    expect(screen.queryByText(/Email không đúng định dạng/)).toBeNull();
  });

  it('hiển thị lỗi inline theo từng dòng khi form yêu cầu validate', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialMembers={[
          { localId: 'l1', memberName: 'An', email: 'an@example.com', studentCode: '' },
          { localId: 'l2', memberName: '', email: 'sai-dinh-dang', studentCode: '' },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Kiểm tra' }));

    // Chỉ dòng 2 lỗi -> mỗi câu lỗi xuất hiện đúng 1 lần, dòng 1 không bị gắn lỗi.
    expect(screen.getAllByText('Tên sinh viên không được để trống.')).toHaveLength(1);
    expect(screen.getAllByText('Email không đúng định dạng, ví dụ: ten@example.com')).toHaveLength(
      1,
    );
  });

  it('không báo lỗi khi MSSV để trống (Requirement 2.2)', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initialMembers={[
          { localId: 'l1', memberName: 'An', email: 'an@example.com', studentCode: '' },
        ]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Kiểm tra' }));

    expect(screen.queryByText('Tên sinh viên không được để trống.')).toBeNull();
    expect(screen.queryByText(/Email không/)).toBeNull();
  });
});
