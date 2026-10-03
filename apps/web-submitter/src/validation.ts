/**
 * Logic validate phía client của form nộp bài.
 *
 * Tách ra khỏi component vì:
 *   - Component chỉ nên lo render + bắt sự kiện; quy tắc nghiệp vụ (tên bắt
 *     buộc, email đúng định dạng, MSSV tuỳ chọn) cần kiểm thử được mà không
 *     phải dựng DOM.
 *   - Cùng 1 quy tắc được dùng ở 2 thời điểm: khi người dùng bấm nộp (task
 *     5.5) và khi hiển thị lỗi inline từng dòng (task 5.3). Nếu mỗi nơi tự
 *     viết lại thì sẽ lệch nhau.
 *
 * Validate ở client CHỈ để UX nhanh và rõ — KHÔNG phải cơ chế bảo vệ. Server
 * validate lại toàn bộ bằng cùng bộ quy tắc (xem
 * `packages/mock-server/src/handlers/submissions.ts`), và Requirement 11.3
 * yêu cầu chặn ở cả hai phía.
 *
 * _Requirements: 2.2, 2.3, 2.4_
 */
import type { TeamMember } from '@quick-grading/shared-types';

/**
 * Regex email "đủ tốt", CỐ TÌNH giống bản ở mock handler
 * (`submissions.ts > EMAIL_REGEX`) chứ không chuẩn RFC đầy đủ.
 *
 * Mục tiêu là chặn input rõ ràng sai (thiếu `@`, thiếu domain, có khoảng
 * trắng). Giữ 2 phía dùng cùng 1 biểu thức để tránh tình huống khó chịu:
 * client cho qua nhưng server từ chối (hoặc ngược lại).
 */
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Một dòng thành viên đang được nhập trên form.
 *
 * Khác `TeamMember` ở 2 điểm, và cả 2 đều có lý do:
 *
 *   - `localId` KHÔNG phải `memberId`. Đây là id chỉ tồn tại ở client, dùng
 *     làm React key và làm khoá tra lỗi theo dòng. `memberId` thật do server
 *     sinh khi tạo Team (service layer nhận `Omit<TeamMember, 'memberId'>[]`),
 *     nên gửi `localId` lên server là vô nghĩa.
 *   - `studentCode` là `string` (không phải `string | undefined`) vì ô input
 *     luôn có giá trị chuỗi, kể cả chuỗi rỗng. Việc đổi chuỗi rỗng thành
 *     `undefined` chỉ xảy ra ở bước cuối, trong `toApiMembers`.
 */
export interface MemberDraft {
  localId: string;
  memberName: string;
  email: string;
  studentCode: string;
}

/** Bộ đếm dự phòng khi môi trường không có `crypto.randomUUID`. */
let fallbackLocalIdCounter = 0;

/**
 * Sinh `localId` cho 1 dòng thành viên mới.
 *
 * Chỉ cần duy nhất TRONG PHẠM VI 1 form đang mở (không bao giờ được lưu hay
 * gửi đi), nên nhánh fallback dùng timestamp + counter là đủ an toàn cho môi
 * trường thiếu `crypto.randomUUID` (vài bản jsdom cũ trong test).
 */
function createLocalId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  fallbackLocalIdCounter += 1;
  return `member-${Date.now().toString(36)}-${fallbackLocalIdCounter}`;
}

/** Tạo 1 dòng thành viên trống (dùng cho dòng mặc định và cho nút "+ Thêm sinh viên"). */
export function createEmptyMember(): MemberDraft {
  return { localId: createLocalId(), memberName: '', email: '', studentCode: '' };
}

/**
 * Lỗi của 1 dòng thành viên. Chỉ có `memberName` và `email` vì theo
 * Requirement 2.2, MSSV là tuỳ chọn nên không bao giờ sinh lỗi.
 */
export interface MemberFieldErrors {
  memberName?: string;
  email?: string;
}

/** Map lỗi theo `localId` của từng dòng thành viên. */
export type MemberErrorMap = Record<string, MemberFieldErrors>;

/**
 * Validate 1 dòng thành viên (Requirement 2.2).
 *
 * Phân biệt "email để trống" với "email sai định dạng" — server gộp cả hai
 * thành 1 câu, nhưng ở form thì nói rõ nguyên nhân giúp người nhập sửa nhanh
 * hơn.
 */
export function validateMember(member: MemberDraft): MemberFieldErrors {
  const errors: MemberFieldErrors = {};

  if (member.memberName.trim().length === 0) {
    errors.memberName = 'Tên sinh viên không được để trống.';
  }

  const email = member.email.trim();
  if (email.length === 0) {
    errors.email = 'Email không được để trống.';
  } else if (!EMAIL_REGEX.test(email)) {
    errors.email = 'Email không đúng định dạng, ví dụ: ten@example.com';
  }

  // MSSV (`studentCode`) tuỳ chọn -> không kiểm tra gì.
  return errors;
}

/**
 * Validate toàn bộ danh sách, trả về map lỗi theo `localId`.
 *
 * Dòng hợp lệ KHÔNG xuất hiện trong map (thay vì gắn object rỗng) để
 * `hasMemberErrors` chỉ cần xét map có khoá nào hay không.
 */
export function validateMembers(members: MemberDraft[]): MemberErrorMap {
  const errorMap: MemberErrorMap = {};
  for (const member of members) {
    const errors = validateMember(member);
    if (Object.keys(errors).length > 0) {
      errorMap[member.localId] = errors;
    }
  }
  return errorMap;
}

/** True nếu có bất kỳ dòng thành viên nào đang lỗi. */
export function hasMemberErrors(errorMap: MemberErrorMap): boolean {
  return Object.keys(errorMap).length > 0;
}

/**
 * Chuyển danh sách đang nhập thành payload cho
 * `teamsApi.createTeamAndSubmit` (`Omit<TeamMember, 'memberId'>[]`).
 *
 * Hai việc quan trọng: cắt khoảng trắng đầu/cuối (để không lưu `" An "`), và
 * đổi MSSV rỗng thành `undefined` — khớp đúng cách mock handler chuẩn hoá
 * (`submissions.ts > parseMembers`) nên dữ liệu lưu xuống nhất quán bất kể
 * người dùng có điền MSSV hay không.
 */
export function toApiMembers(members: MemberDraft[]): Omit<TeamMember, 'memberId'>[] {
  return members.map((member) => {
    const studentCode = member.studentCode.trim();
    return {
      memberName: member.memberName.trim(),
      email: member.email.trim(),
      studentCode: studentCode.length > 0 ? studentCode : undefined,
    };
  });
}

/* ------------------------------------------------------------------------ */
/* File bài làm (task 5.4) — Requirements 2.6, 2.7, 2.8, 11.3               */
/* ------------------------------------------------------------------------ */

/**
 * Kích thước tối đa cho MỖI file: 5MB.
 *
 * Requirement 11.3 yêu cầu chặn ở CẢ client và server, nên con số này cố
 * tình trùng khớp `MAX_FILE_SIZE_BYTES` ở mock handler
 * (`submissions.ts`). Chặn ở client để người dùng biết ngay mà không phải
 * chờ upload xong file 50MB; chặn ở server vì client không đáng tin.
 */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Hai loại file duy nhất được nhận (Requirement 2.6). */
export type SubmissionFileExtension = '.md' | '.xml';

/** Hiển thị kích thước file dạng MB với 1 chữ số thập phân. */
export function formatFileSizeMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Validate danh sách file người dùng vừa chọn cho MỘT ô upload.
 *
 * Nhận `File[]` (không phải 1 `File`) vì cần phát hiện được trường hợp
 * Requirement 2.7 "chọn nhiều hơn 1 file cho mỗi loại". Cloudscape
 * `FileUpload` với `multiple={false}` đã hạn chế việc này ở mức UI, nhưng
 * kiểm tra tường minh ở đây mới là thứ bảo đảm quy tắc và kiểm thử được.
 *
 * Trả về `undefined` nghĩa là hợp lệ.
 */
export function validateSelectedFiles(
  files: File[],
  extension: SubmissionFileExtension,
): string | undefined {
  if (files.length > 1) {
    // Requirement 2.7
    return `Chỉ được chọn đúng 1 file ${extension}.`;
  }
  return validateSubmissionFile(files[0] ?? null, extension);
}

/**
 * Validate 1 file đã chọn cho ô upload tương ứng.
 *
 * Thứ tự kiểm tra có chủ ý: thiếu file -> sai loại -> quá lớn. Báo "sai loại"
 * trước "quá lớn" vì nếu người dùng chọn lẫn file khác thì đó là vấn đề cần
 * sửa trước, và câu lỗi về kích thước của file sai loại chỉ gây nhiễu.
 *
 * So khớp phần mở rộng theo tên file đã lowercase (giống server), KHÔNG dựa
 * vào `file.type`: trình duyệt thường trả MIME rỗng cho `.md`/`.xml` nên
 * `file.type` không đáng tin.
 *
 * Trả về `undefined` nghĩa là hợp lệ.
 */
export function validateSubmissionFile(
  file: File | null,
  extension: SubmissionFileExtension,
): string | undefined {
  if (file === null) {
    // Requirement 2.6: phải có đúng 2 file -> thiếu 1 trong 2 là không nộp được.
    return `Vui lòng chọn file ${extension}.`;
  }

  if (!file.name.toLowerCase().endsWith(extension)) {
    // Requirement 2.7
    return `File phải có phần mở rộng ${extension}.`;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    // Requirement 2.8, 11.3
    return `File nặng ${formatFileSizeMb(file.size)}, vượt quá kích thước tối đa 5MB.`;
  }

  return undefined;
}

/* ------------------------------------------------------------------------ */
/* Toàn bộ form nộp bài (task 5.5)                                          */
/* ------------------------------------------------------------------------ */

/** Validate tên nhóm. Trả `undefined` nghĩa là hợp lệ. */
export function validateTeamName(teamName: string): string | undefined {
  if (teamName.trim().length === 0) {
    return 'Tên nhóm không được để trống.';
  }
  return undefined;
}

/**
 * Toàn bộ dữ liệu đang nhập trên form nộp bài.
 *
 * CỐ TÌNH không có field "tên trường" — Requirement 2.5 nói rõ form KHÔNG
 * được có trường này. Ghi chú tại đây để lần sau có ai định thêm thì thấy
 * ngay là cố ý, không phải bỏ sót.
 */
export interface SubmitFormDraft {
  teamName: string;
  members: MemberDraft[];
  mdFile: File | null;
  xmlFile: File | null;
}

/** Lỗi của toàn bộ form, gom theo đúng từng ô để hiển thị inline. */
export interface SubmitFormErrors {
  teamName?: string;
  members: MemberErrorMap;
  mdFile?: string;
  xmlFile?: string;
}

/**
 * Validate toàn bộ form trước khi gọi API (Requirement 2.9: chỉ gửi khi "có
 * đủ thông tin hợp lệ").
 *
 * Luôn validate TẤT CẢ các ô rồi mới trả về, thay vì dừng ở lỗi đầu tiên —
 * người dùng thấy hết chỗ cần sửa trong 1 lần thay vì sửa xong lại hiện lỗi
 * mới.
 */
export function validateSubmitForm(draft: SubmitFormDraft): SubmitFormErrors {
  return {
    teamName: validateTeamName(draft.teamName),
    members: validateMembers(draft.members),
    mdFile: validateSubmissionFile(draft.mdFile, '.md'),
    xmlFile: validateSubmissionFile(draft.xmlFile, '.xml'),
  };
}

/** True nếu form còn bất kỳ lỗi nào (dùng để chặn việc gọi API). */
export function hasSubmitFormErrors(errors: SubmitFormErrors): boolean {
  return (
    errors.teamName !== undefined ||
    errors.mdFile !== undefined ||
    errors.xmlFile !== undefined ||
    hasMemberErrors(errors.members)
  );
}
