/**
 * Typed domain error classes.
 *
 * See design.md > Error Handling: mock handlers (and, later, real API
 * Gateway/Lambda in giai đoạn 2) trả về HTTP status tương ứng (400/409/404)
 * kèm body `{ code, message }`. Mỗi error class dưới đây map 1-1 với 1 status
 * code, để service layer và UI xử lý hiển thị lỗi nhất quán giữa mock và API
 * thật.
 */

/**
 * Base class cho toàn bộ typed domain error trong hệ thống.
 *
 * Luôn dùng `Object.setPrototypeOf` sau khi gọi `super(message)` để đảm bảo
 * `instanceof` hoạt động đúng khi target biên dịch xuống ES5/CommonJS
 * (built-in `Error` không tự propagate prototype chain qua `extends` trong
 * các target đó).
 */
export abstract class DomainError extends Error {
  /** Mã lỗi ổn định, map 1-1 với HTTP status ở mock/API layer */
  abstract readonly code: string;
  /** HTTP status tương ứng khi mock handler / API trả lỗi này */
  abstract readonly httpStatus: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Input không hợp lệ (tên rỗng, email sai định dạng, file sai loại/kích
 * thước, v.v). HTTP 400.
 *
 * _Requirements: 1.2, 2.7, 2.8_
 */
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR';
  readonly httpStatus = 400;

  /** Tên field bị lỗi validate, nếu có (dùng để highlight FormField trên UI) */
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

/**
 * Tên nhóm đã tồn tại (theo `assignmentId + teamNameNormalized`) và nhóm đó
 * đang `SUBMITTED`. HTTP 409.
 *
 * _Requirements: 2.12, 3.1_
 */
export class TeamNameConflictError extends DomainError {
  readonly code = 'TEAM_NAME_CONFLICT';
  readonly httpStatus = 409;

  readonly teamName: string;
  readonly assignmentId: string;

  constructor(teamName: string, assignmentId: string, message?: string) {
    super(message ?? `Nhóm "${teamName}" đã nộp bài, vui lòng liên hệ Admin nếu cần nộp lại.`);
    this.teamName = teamName;
    this.assignmentId = assignmentId;
  }
}

/**
 * Assignment đang `CLOSED`, chặn tạo nhóm mới hoặc nộp bài mới. HTTP 409.
 *
 * _Requirements: 1.8_
 */
export class AssignmentClosedError extends DomainError {
  readonly code = 'ASSIGNMENT_CLOSED';
  readonly httpStatus = 409;

  readonly assignmentId: string;

  constructor(assignmentId: string, message?: string) {
    super(message ?? 'Đợt chấm này đã đóng, không thể nộp bài.');
    this.assignmentId = assignmentId;
  }
}

/**
 * Nhóm được chọn đã có 1 lượt chấm đang `IN_PROGRESS`, từ chối tạo lượt chấm
 * mới trùng lặp. HTTP 409.
 *
 * _Requirements: 6.3_
 */
export class GradingInProgressError extends DomainError {
  readonly code = 'GRADING_IN_PROGRESS';
  readonly httpStatus = 409;

  readonly teamId: string;

  constructor(teamId: string, message?: string) {
    super(message ?? 'Nhóm này đang được chấm bài, vui lòng thử lại sau.');
    this.teamId = teamId;
  }
}

/**
 * Thông tin đăng nhập không hợp lệ, hoặc request tới khu vực Admin thiếu/hết
 * hạn xác thực. HTTP 401.
 *
 * Ở giai đoạn 1 chỉ dùng cho trường hợp sai tài khoản/mật khẩu ở mock auth
 * (`POST /api/auth/login`). Giai đoạn 2 (Cognito) sẽ tái dùng đúng error này
 * cho token không hợp lệ/hết hạn — nên FE xử lý hiển thị lỗi 1 lần, không đổi
 * khi chuyển giai đoạn.
 *
 * _Requirements: 4.1, 4.4_
 */
export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED';
  readonly httpStatus = 401;

  constructor(message?: string) {
    super(message ?? 'Tài khoản hoặc mật khẩu không đúng.');
  }
}

/**
 * Không tìm thấy resource (Assignment, Team, GradingResult, ...). HTTP 404.
 *
 * _Requirements: 12.3_
 */
export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;

  /** Loại resource không tìm thấy, ví dụ 'Assignment' | 'Team' */
  readonly resourceType: string;
  readonly resourceId: string;

  constructor(resourceType: string, resourceId: string, message?: string) {
    super(message ?? `Không tìm thấy ${resourceType} với id "${resourceId}".`);
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}
