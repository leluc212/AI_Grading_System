/**
 * Unit test cho phần còn lại của `teamsApi` (task 4.3): luồng mở khoá/nộp
 * lại (`unlockResubmission`, `resubmitTeamFiles`) và đọc nội dung file
 * (`getTeamFiles`).
 *
 * Tách riêng khỏi `teamsApi.test.ts` (đã lo list/get/check-name +
 * createTeamAndSubmit) để mỗi file test tập trung 1 luồng nghiệp vụ.
 *
 * Chạy qua MSW server thật (xem `test/setup.ts`): api-client -> fetch ->
 * handler `resubmission.ts` / `team-files.ts` -> map lỗi typed error.
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '@quick-grading/shared-types';
import { getDb, resetMockDb } from '@quick-grading/mock-server';
import { teamsApi } from '../src/index.js';
import {
  TEAM_OPEN_ID,
  TEAM_RESUB_ID,
  TEAM_SUBMITTED_ID,
  makeMdFile,
  makeXmlFile,
} from './helpers.js';

const ADMIN_ID = 'admin';

beforeEach(() => {
  resetMockDb();
});

describe('teamsApi - unlockResubmission', () => {
  it('happy path: nhóm SUBMITTED -> RESUBMISSION_ALLOWED, ghi lại audit trail', async () => {
    const unlocked = await teamsApi.unlockResubmission(TEAM_SUBMITTED_ID, ADMIN_ID);

    expect(unlocked.teamId).toBe(TEAM_SUBMITTED_ID);
    expect(unlocked.status).toBe('RESUBMISSION_ALLOWED');
    expect(unlocked.unlockedBy).toBe(ADMIN_ID);
    expect(unlocked.unlockedAt).toBeTruthy();
  });

  it('nhóm chưa nộp (OPEN) -> ném ValidationError', async () => {
    await expect(teamsApi.unlockResubmission(TEAM_OPEN_ID, ADMIN_ID)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('thiếu adminId -> ném ValidationError', async () => {
    await expect(teamsApi.unlockResubmission(TEAM_SUBMITTED_ID, '')).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('team không tồn tại -> ném NotFoundError', async () => {
    await expect(teamsApi.unlockResubmission('khong-ton-tai', ADMIN_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe('teamsApi - resubmitTeamFiles', () => {
  it('happy path: nhóm RESUBMISSION_ALLOWED nộp lại -> 2 file mới isLatest, team về SUBMITTED', async () => {
    const files = await teamsApi.resubmitTeamFiles(TEAM_RESUB_ID, makeMdFile(), makeXmlFile());

    expect(files).toHaveLength(2);
    expect(files.map((f) => f.fileType).sort()).toEqual(['md', 'xml']);
    expect(files.every((f) => f.isLatest)).toBe(true);
    expect(files.every((f) => f.teamId === TEAM_RESUB_ID)).toBe(true);

    const team = await teamsApi.getTeam(TEAM_RESUB_ID);
    expect(team.status).toBe('SUBMITTED');
  });

  it('nộp lại KHÔNG xoá file cũ, chỉ hạ isLatest của bản ghi cũ', async () => {
    // Seed sẵn 2 file cũ (isLatest = false) cho nhóm này.
    await teamsApi.resubmitTeamFiles(TEAM_RESUB_ID, makeMdFile(), makeXmlFile());

    const stored = getDb().submissionFiles.filter((f) => f.teamId === TEAM_RESUB_ID);
    // 2 file cũ vẫn còn + 2 file mới = 4 bản ghi.
    expect(stored).toHaveLength(4);
    expect(stored.filter((f) => f.isLatest)).toHaveLength(2);
    // File cũ (`bai-lam-v1.*`) vẫn nằm trong lịch sử.
    expect(stored.some((f) => f.fileName === 'bai-lam-v1.md' && !f.isLatest)).toBe(true);
  });

  it('nhóm chưa được mở khoá (đang SUBMITTED) -> ném ValidationError', async () => {
    await expect(
      teamsApi.resubmitTeamFiles(TEAM_SUBMITTED_ID, makeMdFile(), makeXmlFile()),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('sai phần mở rộng file khi nộp lại -> ném ValidationError', async () => {
    const wrongXml = new File(['x'], 'bai-lam.json', { type: 'application/json' });
    await expect(
      teamsApi.resubmitTeamFiles(TEAM_RESUB_ID, makeMdFile(), wrongXml),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('team không tồn tại -> ném NotFoundError', async () => {
    await expect(
      teamsApi.resubmitTeamFiles('khong-ton-tai', makeMdFile(), makeXmlFile()),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('luồng đầy đủ: unlock rồi nộp lại thành công', async () => {
    const unlocked = await teamsApi.unlockResubmission(TEAM_SUBMITTED_ID, ADMIN_ID);
    expect(unlocked.status).toBe('RESUBMISSION_ALLOWED');

    const files = await teamsApi.resubmitTeamFiles(TEAM_SUBMITTED_ID, makeMdFile(), makeXmlFile());
    expect(files).toHaveLength(2);

    const team = await teamsApi.getTeam(TEAM_SUBMITTED_ID);
    expect(team.status).toBe('SUBMITTED');
  });
});

describe('teamsApi - getTeamFiles', () => {
  it('happy path: nhóm đã nộp đủ 2 file -> trả nội dung md + xml', async () => {
    const content = await teamsApi.getTeamFiles(TEAM_SUBMITTED_ID);

    // Seed data chỉ có `s3Key` placeholder (`mock/...`, không phải blob URL
    // vì seed không có `File` object) nên handler trả về chuỗi placeholder
    // thay vì nội dung thật — xem giới hạn giai đoạn 1 ghi ở
    // `handlers/team-files.ts`. Test chỉ khẳng định shape + non-empty, không
    // phụ thuộc vào nội dung cụ thể.
    expect(typeof content.md).toBe('string');
    expect(typeof content.xml).toBe('string');
    expect(content.md.length).toBeGreaterThan(0);
    expect(content.xml.length).toBeGreaterThan(0);
  });

  it('nhóm chưa nộp file nào -> ném ValidationError', async () => {
    await expect(teamsApi.getTeamFiles(TEAM_OPEN_ID)).rejects.toBeInstanceOf(ValidationError);
  });

  it('nhóm chỉ còn file cũ (isLatest = false) -> ném ValidationError', async () => {
    // "Nhóm Sao Băng" đang RESUBMISSION_ALLOWED, 2 file cũ đều isLatest=false.
    await expect(teamsApi.getTeamFiles(TEAM_RESUB_ID)).rejects.toBeInstanceOf(ValidationError);
  });

  it('team không tồn tại -> ném NotFoundError', async () => {
    await expect(teamsApi.getTeamFiles('khong-ton-tai')).rejects.toBeInstanceOf(NotFoundError);
  });
});
