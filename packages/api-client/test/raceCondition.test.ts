/**
 * Test kịch bản race condition khi tạo nhóm (task 12.1).
 *
 * Requirement 3.1 / Property 1 (design.md): không bao giờ tồn tại 2 Team có
 * cùng `assignmentId + teamNameNormalized`. Khi 2 request tạo nhóm cùng tên
 * được gửi ĐỒNG THỜI, đúng 1 request thành công và request còn lại phải nhận
 * lỗi trùng tên.
 *
 * ## Vì sao test này có ý nghĩa dù JavaScript đơn luồng
 *
 * Handler `POST /api/teams/submit` có 1 điểm `await` (đọc `FormData`) trước
 * phần kiểm tra trùng tên. Nếu phần "check trùng tên -> commit" bị chèn thêm
 * `await` nào nữa, 2 request sẽ đan xen nhau và CẢ HAI đều pass bước check
 * trước khi bất kỳ ai commit — đúng kịch bản ghi trùng mà Requirement 3.1
 * cấm. Test này chốt tính nguyên tử đó: nó sẽ fail nếu sau này ai đó thêm
 * `await` vào giữa đoạn check-và-ghi (ví dụ đổi sang đọc/ghi storage bất đồng
 * bộ).
 *
 * _Requirements: 2.12, 2.13, 3.1, 3.2_
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { TeamNameConflictError } from '@quick-grading/shared-types';
import { getDb, resetMockDb } from '@quick-grading/mock-server';
import { gradingApi, teamsApi } from '../src/index.js';
import {
  ASSIGNMENT_CLOSED_ID,
  ASSIGNMENT_OPEN_ID,
  TEAM_OPEN_ID,
  makeMdFile,
  makeValidMember,
  makeXmlFile,
} from './helpers.js';

/** Gửi 1 request tạo nhóm với tên cho trước. */
function submitTeam(teamName: string, assignmentId: string = ASSIGNMENT_OPEN_ID) {
  return teamsApi.createTeamAndSubmit({
    assignmentId,
    teamName,
    members: [makeValidMember()],
    mdFile: makeMdFile(),
    xmlFile: makeXmlFile(),
  });
}

/** Đếm số Team trong store khớp tên đã chuẩn hoá, trong 1 assignment. */
function countTeamsByNormalizedName(assignmentId: string, teamName: string): number {
  const normalized = teamName.trim().toLowerCase();
  return getDb().teams.filter(
    (team) => team.assignmentId === assignmentId && team.teamNameNormalized === normalized,
  ).length;
}

beforeEach(() => {
  resetMockDb();
});

describe('Race condition - 2 request tạo nhóm cùng tên đồng thời (Requirement 3.1)', () => {
  it('chỉ đúng 1 request thành công, request còn lại nhận lỗi trùng tên', async () => {
    const results = await Promise.allSettled([submitTeam('Nhóm Đua'), submitTeam('Nhóm Đua')]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(TeamNameConflictError);
  });

  it('store chỉ có đúng 1 Team sau 2 request đồng thời', async () => {
    await Promise.allSettled([submitTeam('Nhóm Đua'), submitTeam('Nhóm Đua')]);

    // Property 1: không bao giờ có 2 Team cùng assignmentId + teamNameNormalized.
    expect(countTeamsByNormalizedName(ASSIGNMENT_OPEN_ID, 'Nhóm Đua')).toBe(1);
  });

  it('5 request đồng thời cùng tên cũng chỉ 1 thành công', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => submitTeam('Nhóm Đông Người')),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(4);
    for (const rejected of results.filter((r) => r.status === 'rejected')) {
      expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(TeamNameConflictError);
    }
    expect(countTeamsByNormalizedName(ASSIGNMENT_OPEN_ID, 'Nhóm Đông Người')).toBe(1);
  });

  it('chuẩn hoá tên: khác hoa/thường và khoảng trắng vẫn bị coi là trùng', async () => {
    const results = await Promise.allSettled([submitTeam('Nhóm Đua'), submitTeam('  nhóm đua  ')]);

    // Requirement 2.12 dùng tên đã chuẩn hoá (lowercase + trim) để so khớp.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(countTeamsByNormalizedName(ASSIGNMENT_OPEN_ID, 'nhóm đua')).toBe(1);
  });

  it('tên trùng ở Assignment KHÁC thì không bị chặn (Requirement 2.13)', async () => {
    // Mở lại assignment thứ 2 (seed để CLOSED) để nộp được vào cả hai đợt.
    const closedAssignment = getDb().assignments.find(
      (a) => a.assignmentId === ASSIGNMENT_CLOSED_ID,
    );
    if (closedAssignment === undefined) {
      throw new Error('Seed data thiếu assignment thứ 2');
    }
    closedAssignment.status = 'OPEN';

    const results = await Promise.allSettled([
      submitTeam('Nhóm Song Trùng', ASSIGNMENT_OPEN_ID),
      submitTeam('Nhóm Song Trùng', ASSIGNMENT_CLOSED_ID),
    ]);

    // Phạm vi chống trùng chỉ trong cùng 1 Assignment -> cả 2 đều phải thành công.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    expect(countTeamsByNormalizedName(ASSIGNMENT_OPEN_ID, 'Nhóm Song Trùng')).toBe(1);
    expect(countTeamsByNormalizedName(ASSIGNMENT_CLOSED_ID, 'Nhóm Song Trùng')).toBe(1);
  });

  it('request thành công vẫn ghi đủ 2 file (Property 2 - atomicity)', async () => {
    const results = await Promise.allSettled([submitTeam('Nhóm Đua'), submitTeam('Nhóm Đua')]);
    const fulfilled = results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<
      Awaited<ReturnType<typeof submitTeam>>
    >;

    const { team, files } = fulfilled.value;
    expect(team.status).toBe('SUBMITTED');
    expect(files).toHaveLength(2);
    // Không có Team "nửa nộp": SUBMITTED thì phải có đủ 2 file isLatest.
    const latestFiles = getDb().submissionFiles.filter(
      (file) => file.teamId === team.teamId && file.isLatest,
    );
    expect(latestFiles).toHaveLength(2);
    expect(latestFiles.map((f) => f.fileType).sort()).toEqual(['md', 'xml']);
  });

  it('request bị từ chối KHÔNG để lại Team rác trong store', async () => {
    await Promise.allSettled([submitTeam('Nhóm Đua'), submitTeam('Nhóm Đua')]);

    // Chỉ 1 Team được tạo -> request thất bại không ghi gì (commit 1 bước).
    const teams = getDb().teams.filter((t) => t.teamNameNormalized === 'nhóm đua');
    expect(teams).toHaveLength(1);
    // Và không có file mồ côi nào của Team không tồn tại.
    const teamIds = new Set(getDb().teams.map((t) => t.teamId));
    const orphanFiles = getDb().submissionFiles.filter((f) => !teamIds.has(f.teamId));
    expect(orphanFiles).toHaveLength(0);
  });
});

describe('Race condition - nộp lại sau khi thất bại (Requirement 3.2)', () => {
  it('tên nhóm bị từ chối vì validate KHÔNG chiếm chỗ, nộp lại được ngay', async () => {
    // Lần 1 thất bại vì thiếu thành viên hợp lệ.
    await expect(
      teamsApi.createTeamAndSubmit({
        assignmentId: ASSIGNMENT_OPEN_ID,
        teamName: 'Nhóm Thử Lại',
        members: [],
        mdFile: makeMdFile(),
        xmlFile: makeXmlFile(),
      }),
    ).rejects.toThrow();

    // Requirement 3.2: lần thất bại không được chặn lần thử lại bằng lỗi
    // "trùng tên nhóm" — tên đó chưa bao giờ được ghi nhận.
    const result = await submitTeam('Nhóm Thử Lại');
    expect(result.team.status).toBe('SUBMITTED');
    expect(countTeamsByNormalizedName(ASSIGNMENT_OPEN_ID, 'Nhóm Thử Lại')).toBe(1);
  });
});

describe('Property 1 - nộp lại KHÔNG tạo thêm nhóm trùng tên (Requirement 2.14, 3.1)', () => {
  it('nhóm đã mở khoá: nộp lại cùng tên cập nhật đúng nhóm cũ, không tạo nhóm mới', async () => {
    const first = await submitTeam('Nhóm Mở Khoá');
    await teamsApi.unlockResubmission(first.team.teamId, 'admin');

    const second = await submitTeam('Nhóm Mở Khoá');

    // Đây là lỗi từng tồn tại: trước đây bước này tạo ra Team THỨ HAI cùng
    // tên, vi phạm Property 1.
    expect(second.resubmitted).toBe(true);
    expect(second.team.teamId).toBe(first.team.teamId);
    expect(countTeamsByNormalizedName(ASSIGNMENT_OPEN_ID, 'Nhóm Mở Khoá')).toBe(1);
    expect(second.team.status).toBe('SUBMITTED');
  });

  it('nộp lại giữ lịch sử file cũ, chỉ hạ isLatest (Property 4)', async () => {
    const first = await submitTeam('Nhóm Giữ Lịch Sử');
    await teamsApi.unlockResubmission(first.team.teamId, 'admin');
    await submitTeam('Nhóm Giữ Lịch Sử');

    const allFiles = getDb().submissionFiles.filter((f) => f.teamId === first.team.teamId);
    // 2 file cũ + 2 file mới = 4 bản ghi, không bản nào bị xoá.
    expect(allFiles).toHaveLength(4);
    expect(allFiles.filter((f) => f.isLatest)).toHaveLength(2);
  });

  it('nộp lại cập nhật danh sách thành viên theo form vừa nhập', async () => {
    const first = await submitTeam('Nhóm Sửa Thành Viên');
    await teamsApi.unlockResubmission(first.team.teamId, 'admin');

    const second = await teamsApi.createTeamAndSubmit({
      assignmentId: ASSIGNMENT_OPEN_ID,
      teamName: 'Nhóm Sửa Thành Viên',
      members: [
        { memberName: 'Thành viên mới', email: 'moi@example.com', studentCode: 'SV111' },
        { memberName: 'Thành viên thứ hai', email: 'hai@example.com' },
      ],
      mdFile: makeMdFile(),
      xmlFile: makeXmlFile(),
    });

    // Submitter vừa điền lại form -> dữ liệu họ nhập phải được ghi nhận, nhờ đó
    // sửa được email/MSSV gõ sai ở lần nộp trước.
    expect(second.team.members).toHaveLength(2);
    expect(second.team.members[0].memberName).toBe('Thành viên mới');
  });

  it('nhóm đang SUBMITTED vẫn bị chặn trùng tên (Requirement 2.12)', async () => {
    await submitTeam('Nhóm Đã Nộp');

    // Chỉ nhóm đã mở khoá mới được nộp lại; nhóm đang SUBMITTED thì không.
    await expect(submitTeam('Nhóm Đã Nộp')).rejects.toBeInstanceOf(TeamNameConflictError);
    expect(countTeamsByNormalizedName(ASSIGNMENT_OPEN_ID, 'Nhóm Đã Nộp')).toBe(1);
  });

  it('nhóm seed đang OPEN (chưa từng nộp): nộp cùng tên là lần nộp đầu của nhóm đó', async () => {
    // Seed có "Nhóm Phượng Hoàng" ở trạng thái OPEN, chưa có file nào.
    const result = await submitTeam('Nhóm Phượng Hoàng');

    expect(result.team.teamId).toBe(TEAM_OPEN_ID);
    expect(result.team.status).toBe('SUBMITTED');
    // Không sinh ra nhóm thứ hai trùng tên.
    expect(countTeamsByNormalizedName(ASSIGNMENT_OPEN_ID, 'Nhóm Phượng Hoàng')).toBe(1);
  });

  it('2 request nộp lại đồng thời cho nhóm đã mở khoá: chỉ 1 thành công', async () => {
    const first = await submitTeam('Nhóm Đua Nộp Lại');
    await teamsApi.unlockResubmission(first.team.teamId, 'admin');

    const results = await Promise.allSettled([
      submitTeam('Nhóm Đua Nộp Lại'),
      submitTeam('Nhóm Đua Nộp Lại'),
    ]);

    // Request đầu đưa nhóm về SUBMITTED -> request sau gặp lỗi trùng tên.
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    expect(countTeamsByNormalizedName(ASSIGNMENT_OPEN_ID, 'Nhóm Đua Nộp Lại')).toBe(1);
  });

  it('nộp lại không ảnh hưởng lịch sử chấm của nhóm (cùng teamId)', async () => {
    const first = await submitTeam('Nhóm Giữ Điểm');
    await gradingApi.triggerGrading(first.team.teamId, 'admin');

    await teamsApi.unlockResubmission(first.team.teamId, 'admin');
    const second = await submitTeam('Nhóm Giữ Điểm');

    // Dùng lại đúng teamId là điều giữ cho lịch sử chấm không bị tách rời.
    const history = await gradingApi.listGradingHistory(second.team.teamId);
    expect(history).toHaveLength(1);
  });
});
