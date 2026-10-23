/**
 * Submission file domain types.
 *
 * See design.md > Data Models for the source-of-truth shape of these types.
 */
import type { Team, TeamMember } from './team.js';

export type FileType = 'md' | 'xml';

export interface SubmissionFile {
  teamId: string;
  fileType: FileType;
  fileName: string;
  /** giai doan 1: key gia / object URL local */
  s3Key: string;
  etag?: string;
  submittedAt: string;
  isLatest: boolean;
}

/**
 * Nộp bài 2 bước (infra-plan mục 5): tạo phiên upload -> upload thẳng lên S3
 * bằng presigned POST -> finalize.
 */
export interface UploadFileMeta {
  /** phải kết thúc `.md` / `.xml` */
  fileName: string;
  /** 1..MAX_FILE_SIZE_BYTES */
  size: number;
}

/** Body `POST /api/submissions`. */
export interface CreateSubmissionRequest {
  assignmentId: string;
  teamName: string;
  members: Omit<TeamMember, 'memberId'>[];
  files: { md: UploadFileMeta; xml: UploadFileMeta };
}

export interface PresignedPost {
  url: string;
  /** Gửi nguyên các field này, field `file` đặt cuối cùng. */
  fields: Record<string, string>;
}

/** Response 201 của `POST /api/submissions`. */
export interface CreateSubmissionResponse {
  submissionId: string;
  uploads: { md: PresignedPost; xml: PresignedPost };
  /** ISO8601, presigned POST hết hạn */
  expiresAt: string;
}

/** Response 201 (nhóm mới) / 200 (nộp vào nhóm có sẵn) của finalize. */
export type FinalizeSubmissionResponse = {
  team: Team;
  files: SubmissionFile[];
  resubmitted: boolean;
};

/** Tệp trong biên nhận lịch sử nộp bài */
export interface SubmissionHistoryFile {
  fileName: string;
  fileType: FileType;
  size: number;
}

/** Biên nhận lịch sử nộp bài của sinh viên */
export interface SubmissionHistoryItem {
  submissionId: string;
  assignmentId: string;
  assignmentName: string;
  teamId: string;
  teamName: string;
  submittedAt: string;
  status: string;
  resubmitted?: boolean;
  members: TeamMember[];
  files: SubmissionHistoryFile[];
}
