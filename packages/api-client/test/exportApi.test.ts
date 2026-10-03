/**
 * Unit test cho `exportApi` (task 4.3) — happy path + lỗi.
 *
 * Chạy qua MSW server thật (xem `test/setup.ts`).
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '@quick-grading/shared-types';
import { resetMockDb } from '@quick-grading/mock-server';
import { NOT_GRADED_LABEL, exportApi } from '../src/index.js';
import { ASSIGNMENT_OPEN_ID } from './helpers.js';

beforeEach(() => {
  resetMockDb();
});

describe('exportApi', () => {
  it('getAssignmentExportData trả về đủ metadata + 1 row cho mỗi nhóm', async () => {
    const data = await exportApi.getAssignmentExportData(ASSIGNMENT_OPEN_ID);

    expect(data.assignmentId).toBe(ASSIGNMENT_OPEN_ID);
    expect(data.assignmentName).toBeTruthy();
    // 3 nhóm thuộc assignment OPEN.
    expect(data.rows).toHaveLength(3);
  });

  it('nhóm chưa chấm hiển thị finalDisplayScore = CHƯA CHẤM', async () => {
    const data = await exportApi.getAssignmentExportData(ASSIGNMENT_OPEN_ID);
    // Seed chưa có lượt chấm nào -> mọi nhóm đều "CHƯA CHẤM".
    expect(data.rows.every((r) => r.finalDisplayScore === NOT_GRADED_LABEL)).toBe(true);
    expect(data.rows.every((r) => r.gradedAt === null)).toBe(true);
  });

  it('assignment không tồn tại ném NotFoundError', async () => {
    await expect(exportApi.getAssignmentExportData('khong-ton-tai')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
