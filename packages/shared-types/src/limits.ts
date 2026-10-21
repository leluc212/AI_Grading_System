/**
 * Giới hạn input dùng chung giữa client và server (infra-plan mục 5, 8).
 *
 * Server (`services/api`) luôn tự validate lại theo các hằng số này, không tin
 * client. `EMAIL_PATTERN` giống hệt `apps/web-submitter/src/validation.ts`.
 */
/** Kích thước tối đa 1 file nộp bài: 5MB. */
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
/** File rỗng bị từ chối. */
export const MIN_FILE_SIZE_BYTES = 1;
/** Độ dài tối đa tên nhóm (sau NFC + trim). */
export const TEAM_NAME_MAX_LENGTH = 100;
export const MEMBERS_MIN = 1;
export const MEMBERS_MAX = 20;
export const MEMBER_NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 254;
export const STUDENT_CODE_MAX_LENGTH = 30;
export const FILE_NAME_MAX_LENGTH = 255;
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Presigned POST upload hết hạn sau 10 phút. */
export const PRESIGNED_POST_EXPIRES_SECONDS = 600;
/** Phiên upload (chưa finalize) hết hạn sau 1 giờ. */
export const UPLOAD_SESSION_TTL_SECONDS = 3600;
/** Body JSON tối đa 64KB. */
export const MAX_JSON_BODY_BYTES = 65_536;

/** Độ dài tối đa prompt hệ thống giáo viên (PROMPT/HYBRID): 8.000 ký tự. */
export const SYSTEM_PROMPT_MAX_LENGTH = 8_000;
/** Số token đầu vào tối đa mặc định: 50.000 token. */
export const DEFAULT_MAX_INPUT_TOKENS = 50_000;
/** Số token đầu ra tối đa mặc định: 2.000 token. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 2_000;
/** Độ dài nhận xét chung tối đa: 2.000 ký tự. */
export const MAX_FEEDBACK_LENGTH = 2_000;
/** Độ dài nhận xét từng tiêu chí tối đa: 300 ký tự. */
export const MAX_COMMENT_LENGTH = 300;
