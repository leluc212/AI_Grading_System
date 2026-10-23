/**
 * Kiểu dữ liệu xác thực cho Submitter (Sinh viên) và Nhật ký đăng nhập (Login Audit Logs).
 */

/** Danh tính sinh viên sau khi đăng nhập qua Cognito / Google OAuth. */
export interface SubmitterIdentity {
  /** Cognito Subject Identifier hoặc Google Subject */
  sub: string;
  /** Email sinh viên đã xác thực từ Google */
  email: string;
  /** Tên hiển thị của sinh viên */
  name: string;
  /** Đường dẫn ảnh đại diện (nếu có từ Google) */
  avatarUrl?: string;
  /** Nhà cung cấp danh tính */
  provider: 'Google' | 'Cognito' | 'Mock';
}

/** Bản ghi nhật ký đăng nhập được lưu trữ trên hệ thống để Admin theo dõi. */
export interface LoginAuditLog {
  logId: string;
  userSub: string;
  email: string;
  name: string;
  provider: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  status: 'SUCCESS' | 'FAILED';
}

/** Payload gửi từ Submitter client khi ghi nhận phiên đăng nhập thành công. */
export interface RecordLoginLogRequest {
  email: string;
  name?: string;
  userSub?: string;
  provider?: string;
}

/** Phản hồi danh sách nhật ký đăng nhập cho trang Admin. */
export interface ListLoginLogsResponse {
  items: LoginAuditLog[];
  nextToken?: string;
}
