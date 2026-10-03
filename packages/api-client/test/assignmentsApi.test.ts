/**
 * Unit test cho `assignmentsApi` (task 4.3) — happy path + lỗi.
 *
 * Chạy qua MSW server thật (xem `test/setup.ts`): api-client -> fetch ->
 * handler `assignments.ts` -> map lỗi typed error.
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '@quick-grading/shared-types';
import { resetMockDb } from '@quick-grading/mock-server';
import { assignmentsApi } from '../src/index.js';
import { ASSIGNMENT_OPEN_ID } from './helpers.js';

beforeEach(() => {
  resetMockDb();
});

describe('assignmentsApi', () => {
  it('listAssignments trả về các assignment đã seed', async () => {
    const assignments = await assignmentsApi.listAssignments();
    expect(assignments).toHaveLength(2);

    const open = assignments.find((a) => a.assignmentId === ASSIGNMENT_OPEN_ID);
    expect(open).toBeDefined();
    expect(open?.status).toBe('OPEN');
  });

  it('getAssignment với id không tồn tại ném NotFoundError', async () => {
    await expect(assignmentsApi.getAssignment('khong-ton-tai')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('createAssignment với tên rỗng ném ValidationError', async () => {
    await expect(assignmentsApi.createAssignment({ assignmentName: '' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('createAssignment hợp lệ trả về assignment mới ở trạng thái OPEN', async () => {
    const created = await assignmentsApi.createAssignment({ assignmentName: 'Đợt 3 - Test' });
    expect(created.assignmentName).toBe('Đợt 3 - Test');
    expect(created.status).toBe('OPEN');
    expect(created.assignmentId).toBeTruthy();

    // Đã thực sự được lưu vào store.
    const all = await assignmentsApi.listAssignments();
    expect(all).toHaveLength(3);
  });

  it('setAssignmentStatus đổi được trạng thái assignment', async () => {
    const updated = await assignmentsApi.setAssignmentStatus(ASSIGNMENT_OPEN_ID, 'CLOSED');
    expect(updated.assignmentId).toBe(ASSIGNMENT_OPEN_ID);
    expect(updated.status).toBe('CLOSED');

    const reopened = await assignmentsApi.setAssignmentStatus(ASSIGNMENT_OPEN_ID, 'OPEN');
    expect(reopened.status).toBe('OPEN');
  });

  it('setAssignmentStatus với id không tồn tại ném NotFoundError', async () => {
    await expect(
      assignmentsApi.setAssignmentStatus('khong-ton-tai', 'CLOSED'),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
