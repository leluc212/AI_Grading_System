/**
 * Unit test cho quy tắc validate thành viên (task 5.3).
 *
 * Test ở mức hàm thuần, không dựng DOM — những quy tắc này là nghiệp vụ
 * (Requirement 2.2) và phải đúng độc lập với việc UI render thế nào.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_SIZE_BYTES,
  createEmptyMember,
  hasMemberErrors,
  hasSubmitFormErrors,
  toApiMembers,
  validateMember,
  validateMembers,
  validateSelectedFiles,
  validateSubmissionFile,
  validateSubmitForm,
  validateTeamName,
  type MemberDraft,
  type SubmitFormDraft,
} from '../src/validation';
import { makeFile } from './fixtures';

function makeMember(overrides: Partial<MemberDraft> = {}): MemberDraft {
  return {
    localId: 'local-1',
    memberName: 'Nguyễn Văn An',
    email: 'an.nguyen@example.com',
    studentCode: 'SV001',
    ...overrides,
  };
}

describe('createEmptyMember', () => {
  it('tạo dòng trống với localId duy nhất', () => {
    const first = createEmptyMember();
    const second = createEmptyMember();

    expect(first.memberName).toBe('');
    expect(first.email).toBe('');
    expect(first.studentCode).toBe('');
    expect(first.localId).not.toBe(second.localId);
  });
});

describe('validateMember', () => {
  it('không báo lỗi với thành viên hợp lệ', () => {
    expect(validateMember(makeMember())).toEqual({});
  });

  it('bắt buộc tên sinh viên', () => {
    expect(validateMember(makeMember({ memberName: '' })).memberName).toBe(
      'Tên sinh viên không được để trống.',
    );
  });

  it('coi tên chỉ gồm khoảng trắng là để trống', () => {
    expect(validateMember(makeMember({ memberName: '   ' })).memberName).toBeDefined();
  });

  it('bắt buộc email, phân biệt rõ "để trống" và "sai định dạng"', () => {
    expect(validateMember(makeMember({ email: '' })).email).toBe('Email không được để trống.');
    expect(validateMember(makeMember({ email: 'khong-phai-email' })).email).toBe(
      'Email không đúng định dạng, ví dụ: ten@example.com',
    );
  });

  it.each(['a@b', 'a@b.', '@example.com', 'ten @example.com', 'ten@exam ple.com'])(
    'từ chối email sai định dạng: %s',
    (email) => {
      expect(validateMember(makeMember({ email })).email).toBeDefined();
    },
  );

  it('chấp nhận email có khoảng trắng dư ở hai đầu', () => {
    expect(validateMember(makeMember({ email: '  an@example.com  ' })).email).toBeUndefined();
  });

  it('KHÔNG bắt buộc MSSV (Requirement 2.2)', () => {
    const errors = validateMember(makeMember({ studentCode: '' }));
    expect(errors).toEqual({});
  });
});

describe('validateMembers', () => {
  it('chỉ đưa vào map những dòng đang lỗi, khoá theo localId', () => {
    const errorMap = validateMembers([
      makeMember({ localId: 'ok' }),
      makeMember({ localId: 'thieu-ten', memberName: '' }),
      makeMember({ localId: 'email-sai', email: 'sai' }),
    ]);

    expect(Object.keys(errorMap).sort()).toEqual(['email-sai', 'thieu-ten']);
    expect(errorMap['ok']).toBeUndefined();
    expect(hasMemberErrors(errorMap)).toBe(true);
  });

  it('trả map rỗng khi mọi dòng hợp lệ', () => {
    const errorMap = validateMembers([makeMember({ localId: 'a' }), makeMember({ localId: 'b' })]);

    expect(errorMap).toEqual({});
    expect(hasMemberErrors(errorMap)).toBe(false);
  });
});

describe('toApiMembers', () => {
  it('cắt khoảng trắng và bỏ localId khỏi payload', () => {
    const [member] = toApiMembers([
      makeMember({ memberName: '  An  ', email: '  an@example.com ', studentCode: ' SV001 ' }),
    ]);

    expect(member).toEqual({
      memberName: 'An',
      email: 'an@example.com',
      studentCode: 'SV001',
    });
    expect('localId' in member).toBe(false);
  });

  it('đổi MSSV rỗng thành undefined thay vì chuỗi rỗng', () => {
    expect(toApiMembers([makeMember({ studentCode: '   ' })])[0].studentCode).toBeUndefined();
  });

  it('giữ nguyên thứ tự thành viên', () => {
    const payload = toApiMembers([
      makeMember({ localId: '1', memberName: 'A' }),
      makeMember({ localId: '2', memberName: 'B' }),
      makeMember({ localId: '3', memberName: 'C' }),
    ]);

    expect(payload.map((member) => member.memberName)).toEqual(['A', 'B', 'C']);
  });
});

describe('validateSubmissionFile', () => {
  it('yêu cầu phải chọn file khi chưa có file nào', () => {
    expect(validateSubmissionFile(null, '.md')).toBe('Vui lòng chọn file .md.');
    expect(validateSubmissionFile(null, '.xml')).toBe('Vui lòng chọn file .xml.');
  });

  it('chấp nhận file đúng loại, trong giới hạn kích thước', () => {
    expect(validateSubmissionFile(makeFile('bai-lam.md'), '.md')).toBeUndefined();
    expect(validateSubmissionFile(makeFile('bai-lam.xml'), '.xml')).toBeUndefined();
  });

  it('so khớp phần mở rộng không phân biệt chữ hoa/thường', () => {
    expect(validateSubmissionFile(makeFile('BAI-LAM.MD'), '.md')).toBeUndefined();
  });

  it('từ chối file sai phần mở rộng (Requirement 2.7)', () => {
    expect(validateSubmissionFile(makeFile('bai-lam.txt'), '.md')).toBe(
      'File phải có phần mở rộng .md.',
    );
    expect(validateSubmissionFile(makeFile('bai-lam.md'), '.xml')).toBe(
      'File phải có phần mở rộng .xml.',
    );
  });

  it('từ chối file vượt 5MB và nêu kích thước thật (Requirement 2.8, 11.3)', () => {
    const error = validateSubmissionFile(makeFile('to.md', 6 * 1024 * 1024), '.md');
    expect(error).toBe('File nặng 6.0MB, vượt quá kích thước tối đa 5MB.');
  });

  it('chấp nhận file đúng bằng ngưỡng 5MB, từ chối khi hơn 1 byte', () => {
    expect(validateSubmissionFile(makeFile('bien.md', MAX_FILE_SIZE_BYTES), '.md')).toBeUndefined();
    expect(
      validateSubmissionFile(makeFile('bien.md', MAX_FILE_SIZE_BYTES + 1), '.md'),
    ).toBeDefined();
  });

  it('báo sai loại trước khi báo quá kích thước', () => {
    // File vừa sai loại vừa quá lớn -> ưu tiên nói về loại file, vì đó là thứ
    // người dùng cần sửa trước; câu lỗi kích thước của file sai loại chỉ gây nhiễu.
    const error = validateSubmissionFile(makeFile('sai.txt', 9 * 1024 * 1024), '.md');
    expect(error).toBe('File phải có phần mở rộng .md.');
  });
});

describe('validateSelectedFiles', () => {
  it('từ chối khi có nhiều hơn 1 file cho cùng 1 ô (Requirement 2.7)', () => {
    const error = validateSelectedFiles([makeFile('mot.md'), makeFile('hai.md')], '.md');
    expect(error).toBe('Chỉ được chọn đúng 1 file .md.');
  });

  it('coi danh sách rỗng là chưa chọn file', () => {
    expect(validateSelectedFiles([], '.md')).toBe('Vui lòng chọn file .md.');
  });

  it('validate file duy nhất như validateSubmissionFile', () => {
    expect(validateSelectedFiles([makeFile('bai-lam.md')], '.md')).toBeUndefined();
    expect(validateSelectedFiles([makeFile('bai-lam.txt')], '.md')).toBe(
      'File phải có phần mở rộng .md.',
    );
  });
});

describe('validateTeamName', () => {
  it('bắt buộc tên nhóm', () => {
    expect(validateTeamName('')).toBe('Tên nhóm không được để trống.');
    expect(validateTeamName('   ')).toBe('Tên nhóm không được để trống.');
  });

  it('chấp nhận tên nhóm có nội dung', () => {
    expect(validateTeamName('Nhóm Rồng Vàng')).toBeUndefined();
  });
});

describe('validateSubmitForm / hasSubmitFormErrors', () => {
  const validDraft = (): SubmitFormDraft => ({
    teamName: 'Nhóm Rồng Vàng',
    members: [makeMember()],
    mdFile: makeFile('bai-lam.md'),
    xmlFile: makeFile('bai-lam.xml'),
  });

  it('không báo lỗi với form đầy đủ và hợp lệ', () => {
    const errors = validateSubmitForm(validDraft());

    expect(hasSubmitFormErrors(errors)).toBe(false);
    expect(errors).toEqual({
      teamName: undefined,
      members: {},
      mdFile: undefined,
      xmlFile: undefined,
    });
  });

  it('báo tất cả lỗi trong 1 lần thay vì dừng ở lỗi đầu tiên', () => {
    const errors = validateSubmitForm({
      teamName: '',
      members: [makeMember({ memberName: '', email: 'sai' })],
      mdFile: null,
      xmlFile: makeFile('sai.txt'),
    });

    expect(errors.teamName).toBeDefined();
    expect(errors.mdFile).toBeDefined();
    expect(errors.xmlFile).toBeDefined();
    expect(Object.keys(errors.members)).toHaveLength(1);
    expect(hasSubmitFormErrors(errors)).toBe(true);
  });

  it('coi form có lỗi khi chỉ riêng thành viên sai', () => {
    const errors = validateSubmitForm({
      ...validDraft(),
      members: [makeMember({ email: 'khong-phai-email' })],
    });

    expect(errors.teamName).toBeUndefined();
    expect(hasSubmitFormErrors(errors)).toBe(true);
  });
});
