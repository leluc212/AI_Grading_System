/**
 * Mock của lớp service (`src/services`) dùng chung cho mọi test `web-admin`.
 *
 * Vì sao gom vào 1 chỗ: `vi.mock` thay thế TOÀN BỘ module, nên factory phải
 * khai báo đủ mọi domain mà bất kỳ component nào trong cây render có thể gọi
 * tới. Nếu mỗi test file tự khai báo một phần, chỉ cần thêm 1 lời gọi API mới
 * ở 1 trang là hàng loạt test ở các file khác vỡ với lỗi "không phải là
 * function" — rất khó truy.
 *
 * Cách dùng (factory phải là async để `vi.mock` hoisting không chặn import):
 *
 * ```ts
 * vi.mock('../src/services', async () => (await import('./servicesMock')).createServicesMock());
 * ```
 *
 * Sau đó import như thường rồi `vi.mocked(...)` để đặt hành vi:
 *
 * ```ts
 * import { assignmentsApi } from '../src/services';
 * vi.mocked(assignmentsApi.listAssignments).mockResolvedValue([]);
 * ```
 */
import { vi } from 'vitest';

/** Tạo bộ mock đầy đủ các domain mà `src/services` re-export. */
export function createServicesMock() {
  return {
    assignmentsApi: {
      listAssignments: vi.fn(),
      getAssignment: vi.fn(),
      createAssignment: vi.fn(),
      setAssignmentStatus: vi.fn(),
    },
    teamsApi: {
      listTeams: vi.fn(),
      getTeam: vi.fn(),
      checkTeamNameAvailable: vi.fn(),
      createTeamAndSubmit: vi.fn(),
      resubmitTeamFiles: vi.fn(),
      unlockResubmission: vi.fn(),
      getTeamFiles: vi.fn(),
    },
    gradingApi: {
      triggerGrading: vi.fn(),
      listGradingHistory: vi.fn(),
      getLatestGrading: vi.fn(),
      submitReview: vi.fn(),
    },
    rubricsApi: {
      getActiveRubric: vi.fn(),
      listRubricVersions: vi.fn(),
      saveRubric: vi.fn(),
    },
    exportApi: {
      // Tên hàm phải khớp bản THẬT ở `api-client` (`getAssignmentExportData`),
      // không phải `exportAssignmentToExcel` như contract trong design.md:
      // việc dựng file `.xlsx` đã được chuyển sang client (`src/excelExport.ts`),
      // nên service layer chỉ còn lấy dữ liệu nguồn.
      getAssignmentExportData: vi.fn(),
    },
    authApi: {
      login: vi.fn(),
      logout: vi.fn(),
      getCurrentAdmin: vi.fn(),
    },
  };
}
