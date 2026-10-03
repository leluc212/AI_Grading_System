/**
 * Team domain types.
 *
 * See design.md > Data Models for the source-of-truth shape of these types.
 */

export type TeamStatus = 'OPEN' | 'SUBMITTED' | 'RESUBMISSION_ALLOWED';

export interface TeamMember {
  /** UUID, sinh o client khi them dong */
  memberId: string;
  memberName: string;
  email: string;
  studentCode?: string;
}

export interface Team {
  /** UUID */
  teamId: string;
  assignmentId: string;
  teamName: string;
  /** lowercase+trim, dung noi bo de check trung (composite key thuc su la assignmentId+teamNameNormalized) */
  teamNameNormalized: string;
  members: TeamMember[];
  status: TeamStatus;
  createdAt: string;
  createdBy?: string;
  unlockedBy?: string;
  unlockedAt?: string;
}
