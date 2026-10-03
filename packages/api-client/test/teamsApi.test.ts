/**
 * Unit test cho `teamsApi` (task 4.3) — happy path + 2 lỗi bắt buộc:
 * trùng tên nhóm (TeamNameConflictError) và assignment đã đóng
 * (AssignmentClosedError).
 *
 * Chạy qua MSW server thật (xem `test/setup.ts`).
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AssignmentClosedError,
  NotFoundError,
  TeamNameConflictError,
  ValidationError,
} from '@quick-grading/shared-types';
import { resetMockDb } from '@quick-grading/mock-server';
import { teamsApi } from '../src/index.js';
import {
  ASSIGNMENT_CLOSED_ID,
  ASSIGNMENT_OPEN_ID,
  TEAM_SUBMITTED_ID,
  TEAM_SUBMITTED_NAME,
  makeMdFile,
  makeValidMember,
  makeXmlFile,
} from './helpers.js';

beforeEach(() => {
  resetMockDb();
});

describe('teamsApi - list/get/check-name', () => {
  it('listTeams trả về các nhóm của assignment', async () => {
    const teams = await teamsApi.listTeams(ASSIGNMENT_OPEN_ID);
    // Seed: 3 nhóm thuộc assignment OPEN (Rồng Vàng, Phượng Hoàng, Sao Băng).
    expect(teams).toHaveLength(3);
    expect(teams.every((t) => t.assignmentId === ASSIGNMENT_OPEN_ID)).toBe(true);
  });

  it('listTeams lọc theo trạng thái', async () => {
    const submitted = await teamsApi.listTeams(ASSIGNMENT_OPEN_ID, { status: 'SUBMITTED' });
    expect(submitted).toHaveLength(1);
    expect(submitted[0].teamId).toBe(TEAM_SUBMITTED_ID);
  });

  it('getTeam với id không tồn tại ném NotFoundError', async () => {
    await expect(teamsApi.getTeam('khong-ton-tai')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('checkTeamNameAvailable trả về false cho tên nhóm đã SUBMITTED', async () => {
    const result = await teamsApi.checkTeamNameAvailable(ASSIGNMENT_OPEN_ID, TEAM_SUBMITTED_NAME);
    expect(result.available).toBe(false);
  });

  it('checkTeamNameAvailable trả về true cho tên còn trống', async () => {
    const result = await teamsApi.checkTeamNameAvailable(ASSIGNMENT_OPEN_ID, 'Nhóm Chưa Tồn Tại');
    expect(result.available).toBe(true);
  });
});

describe('teamsApi - createTeamAndSubmit', () => {
  it('happy path: tạo nhóm mới + nộp 2 file trong assignment OPEN', async () => {
    const result = await teamsApi.createTeamAndSubmit({
      assignmentId: ASSIGNMENT_OPEN_ID,
      teamName: 'Nhóm Kỳ Lân',
      members: [makeValidMember()],
      mdFile: makeMdFile(),
      xmlFile: makeXmlFile(),
    });

    expect(result.team.teamName).toBe('Nhóm Kỳ Lân');
    expect(result.team.status).toBe('SUBMITTED');
    expect(result.team.members).toHaveLength(1);
    expect(result.files).toHaveLength(2);
    expect(result.files.map((f) => f.fileType).sort()).toEqual(['md', 'xml']);
    expect(result.files.every((f) => f.isLatest)).toBe(true);
  });

  it('trùng tên nhóm (nhóm đang SUBMITTED) ném TeamNameConflictError', async () => {
    await expect(
      teamsApi.createTeamAndSubmit({
        assignmentId: ASSIGNMENT_OPEN_ID,
        teamName: TEAM_SUBMITTED_NAME,
        members: [makeValidMember()],
        mdFile: makeMdFile(),
        xmlFile: makeXmlFile(),
      }),
    ).rejects.toBeInstanceOf(TeamNameConflictError);
  });

  it('nộp vào assignment đã CLOSED ném AssignmentClosedError', async () => {
    await expect(
      teamsApi.createTeamAndSubmit({
        assignmentId: ASSIGNMENT_CLOSED_ID,
        teamName: 'Nhóm Mới Trong Đợt Đóng',
        members: [makeValidMember()],
        mdFile: makeMdFile(),
        xmlFile: makeXmlFile(),
      }),
    ).rejects.toBeInstanceOf(AssignmentClosedError);
  });

  it('email sai định dạng ném ValidationError', async () => {
    await expect(
      teamsApi.createTeamAndSubmit({
        assignmentId: ASSIGNMENT_OPEN_ID,
        teamName: 'Nhóm Email Sai',
        members: [{ memberName: 'Sai Email', email: 'khong-phai-email' }],
        mdFile: makeMdFile(),
        xmlFile: makeXmlFile(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('sai phần mở rộng file ném ValidationError', async () => {
    // Truyền file .txt vào chỗ đáng lẽ là .md -> handler từ chối.
    const wrongMd = new File(['x'], 'bai-lam.txt', { type: 'text/plain' });
    await expect(
      teamsApi.createTeamAndSubmit({
        assignmentId: ASSIGNMENT_OPEN_ID,
        teamName: 'Nhóm File Sai',
        members: [makeValidMember()],
        mdFile: wrongMd,
        xmlFile: makeXmlFile(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
