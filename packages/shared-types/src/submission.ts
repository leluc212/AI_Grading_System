/**
 * Submission file domain types.
 *
 * See design.md > Data Models for the source-of-truth shape of these types.
 */

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
