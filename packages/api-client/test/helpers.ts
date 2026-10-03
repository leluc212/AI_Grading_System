/**
 * Hằng số + tiện ích dùng chung cho các test service layer (task 4.3).
 *
 * Các id dưới đây khớp đúng seed data trong
 * `packages/mock-server/src/db.ts` (`createSeedDb`). Mỗi test-file gọi
 * `resetMockDb()` ở `beforeEach` nên các id này luôn hợp lệ khi test chạy.
 */

/** Assignment đang OPEN (Đợt 1) */
export const ASSIGNMENT_OPEN_ID = 'a1111111-1111-4111-8111-111111111111';
/** Assignment đang CLOSED (Đợt 2) */
export const ASSIGNMENT_CLOSED_ID = 'a2222222-2222-4222-8222-222222222222';

/** Team "Nhóm Rồng Vàng" — SUBMITTED, thuộc assignment OPEN, có 2 file latest */
export const TEAM_SUBMITTED_ID = 't1111111-1111-4111-8111-111111111111';
export const TEAM_SUBMITTED_NAME = 'Nhóm Rồng Vàng';
/** Team "Nhóm Phượng Hoàng" — OPEN, chưa nộp file nào */
export const TEAM_OPEN_ID = 't2222222-2222-4222-8222-222222222222';
/** Team "Nhóm Sao Băng" — RESUBMISSION_ALLOWED */
export const TEAM_RESUB_ID = 't3333333-3333-4333-8333-333333333333';

/** Tạo 1 file `.md` hợp lệ để nộp bài trong test. */
export function makeMdFile(content = '# Bài làm nhóm\n\nNội dung.'): File {
  return new File([content], 'bai-lam.md', { type: 'text/markdown' });
}

/** Tạo 1 file `.xml` hợp lệ để nộp bài trong test. */
export function makeXmlFile(content = '<submission><answer>42</answer></submission>'): File {
  return new File([content], 'bai-lam.xml', { type: 'application/xml' });
}

/** 1 thành viên hợp lệ (tên + email đúng format) cho happy-path nộp bài. */
export function makeValidMember(): { memberName: string; email: string; studentCode?: string } {
  return { memberName: 'Nguyễn Văn Test', email: 'test.nguyen@example.com', studentCode: 'SV999' };
}
