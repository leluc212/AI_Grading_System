/**
 * Test việc xuất điểm ra `.xlsx` (task 11.1, 11.2).
 *
 * Phần lớn kiểm ở mức hàm thuần (`buildSheetRows`, `buildExcelFileName`) vì
 * đó là nơi chứa quy tắc nghiệp vụ của Requirement 10.2/10.3. Có thêm 1 test
 * dựng workbook thật để chắc chắn file sinh ra hợp lệ và đọc lại được — nếu
 * chỉ test hàm thuần thì sai sót ở tầng `exceljs` sẽ không ai thấy.
 *
 * _Requirements: 7.6, 10.1, 10.2, 10.3, 10.4_
 */
import { describe, expect, it, vi } from 'vitest';
import type { AssignmentExportData } from '@quick-grading/api-client';
import { NOT_GRADED_LABEL } from '@quick-grading/api-client';
import {
  EXPORT_COLUMN_HEADERS,
  XLSX_MIME_TYPE,
  buildAssignmentExcelBlob,
  buildAssignmentExcelBuffer,
  buildExcelFileName,
  buildSheetRows,
  downloadExcelFile,
} from '../src/excelExport';

function makeExportData(overrides: Partial<AssignmentExportData> = {}): AssignmentExportData {
  return {
    assignmentId: 'a-1',
    assignmentName: 'Đợt 1 - Lập trình Web - K21',
    rows: [],
    ...overrides,
  };
}

describe('buildSheetRows - một dòng mỗi thành viên (Requirement 10.2)', () => {
  it('lặp tên nhóm và điểm cho từng thành viên', () => {
    const rows = buildSheetRows(
      makeExportData({
        rows: [
          {
            teamName: 'Nhóm Rồng Vàng',
            members: [
              { memberName: 'Nguyễn Văn An', studentCode: 'SV001' },
              { memberName: 'Trần Thị Bình', studentCode: 'SV002' },
            ],
            finalDisplayScore: 85,
            reviewStatus: 'NOT_REQUIRED',
            gradedAt: '2024-09-02T10:00:00.000Z',
          },
        ],
      }),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].teamName).toBe('Nhóm Rồng Vàng');
    expect(rows[1].teamName).toBe('Nhóm Rồng Vàng');
    expect(rows.map((r) => r.memberName)).toEqual(['Nguyễn Văn An', 'Trần Thị Bình']);
    expect(rows.map((r) => r.studentCode)).toEqual(['SV001', 'SV002']);
    // Cả nhóm cùng 1 điểm (Requirement 6.7).
    expect(rows.every((r) => r.finalScore === 85)).toBe(true);
  });

  it('hiện dấu gạch cho thành viên không có MSSV', () => {
    const rows = buildSheetRows(
      makeExportData({
        rows: [
          {
            teamName: 'Nhóm A',
            members: [{ memberName: 'Lê Minh Châu' }],
            finalDisplayScore: 70,
            reviewStatus: 'NOT_REQUIRED',
            gradedAt: '2024-09-02T10:00:00.000Z',
          },
        ],
      }),
    );

    expect(rows[0].studentCode).toBe('—');
  });

  it('vẫn xuất 1 dòng cho nhóm không có thành viên nào', () => {
    const rows = buildSheetRows(
      makeExportData({
        rows: [
          {
            teamName: 'Nhóm Trống',
            members: [],
            finalDisplayScore: NOT_GRADED_LABEL,
            reviewStatus: null,
            gradedAt: null,
          },
        ],
      }),
    );

    // Thiếu nhóm trong bảng điểm khó phát hiện hơn là thấy 1 dòng trống tên.
    expect(rows).toHaveLength(1);
    expect(rows[0].teamName).toBe('Nhóm Trống');
  });

  it('gộp nhiều nhóm theo đúng thứ tự', () => {
    const rows = buildSheetRows(
      makeExportData({
        rows: [
          {
            teamName: 'Nhóm A',
            members: [{ memberName: 'A1' }],
            finalDisplayScore: 80,
            reviewStatus: 'NOT_REQUIRED',
            gradedAt: '2024-09-02T10:00:00.000Z',
          },
          {
            teamName: 'Nhóm B',
            members: [{ memberName: 'B1' }, { memberName: 'B2' }],
            finalDisplayScore: 90,
            reviewStatus: 'REVIEWED',
            gradedAt: '2024-09-03T10:00:00.000Z',
          },
        ],
      }),
    );

    expect(rows.map((r) => r.teamName)).toEqual(['Nhóm A', 'Nhóm B', 'Nhóm B']);
  });
});

describe('buildSheetRows - nhóm chưa chấm (Requirement 10.3)', () => {
  it('ghi rõ "CHƯA CHẤM" thay vì để trống hoặc 0', () => {
    const rows = buildSheetRows(
      makeExportData({
        rows: [
          {
            teamName: 'Nhóm Chưa Chấm',
            members: [{ memberName: 'An', studentCode: 'SV001' }],
            finalDisplayScore: NOT_GRADED_LABEL,
            reviewStatus: null,
            gradedAt: null,
          },
        ],
      }),
    );

    expect(rows[0].finalScore).toBe('CHƯA CHẤM');
    // Tuyệt đối không được là chuỗi rỗng hay số 0.
    expect(rows[0].finalScore).not.toBe('');
    expect(rows[0].finalScore).not.toBe(0);
    expect(rows[0].reviewStatus).toBe('—');
    expect(rows[0].gradedAt).toBe('—');
  });

  it('ghi điểm 0 thật sự là số 0, không phải "CHƯA CHẤM"', () => {
    const rows = buildSheetRows(
      makeExportData({
        rows: [
          {
            teamName: 'Nhóm Điểm 0',
            members: [{ memberName: 'An' }],
            finalDisplayScore: 0,
            reviewStatus: 'REVIEWED',
            gradedAt: '2024-09-02T10:00:00.000Z',
          },
        ],
      }),
    );

    // Đây chính là sự nhầm lẫn mà Requirement 10.3 muốn tránh — phải phân biệt được.
    expect(rows[0].finalScore).toBe(0);
  });

  it('ghi điểm dạng SỐ để Excel tính toán được', () => {
    const rows = buildSheetRows(
      makeExportData({
        rows: [
          {
            teamName: 'Nhóm A',
            members: [{ memberName: 'An' }],
            finalDisplayScore: 85,
            reviewStatus: 'NOT_REQUIRED',
            gradedAt: '2024-09-02T10:00:00.000Z',
          },
        ],
      }),
    );

    expect(typeof rows[0].finalScore).toBe('number');
  });
});

describe('buildSheetRows - trạng thái review', () => {
  it.each([
    ['NOT_REQUIRED', 'Không cần review'],
    ['PENDING_REVIEW', 'Chờ review'],
    ['REVIEWED', 'Đã review'],
  ] as const)('dịch %s thành "%s"', (status, label) => {
    const rows = buildSheetRows(
      makeExportData({
        rows: [
          {
            teamName: 'Nhóm A',
            members: [{ memberName: 'An' }],
            finalDisplayScore: 85,
            reviewStatus: status,
            gradedAt: '2024-09-02T10:00:00.000Z',
          },
        ],
      }),
    );

    expect(rows[0].reviewStatus).toBe(label);
  });
});

describe('buildExcelFileName', () => {
  it('bỏ dấu tiếng Việt và ký tự đặc biệt khỏi tên file', () => {
    const name = buildExcelFileName(
      'Đợt 1 - Lập trình Web - K21',
      new Date('2024-09-05T00:00:00Z'),
    );

    // Tên file có dấu dễ lỗi encoding khi mở trên máy/hệ thống khác.
    expect(name).toBe('diem-dot-1-lap-trinh-web-k21-2024-09-05.xlsx');
  });

  it('dùng tên mặc định khi tên đợt chấm không còn ký tự hợp lệ', () => {
    const name = buildExcelFileName('***', new Date('2024-09-05T00:00:00Z'));

    expect(name).toBe('diem-dot-cham-2024-09-05.xlsx');
  });

  it('luôn có phần mở rộng .xlsx', () => {
    expect(buildExcelFileName('Đợt 2').endsWith('.xlsx')).toBe(true);
  });
});

describe('buildAssignmentExcelBlob (Requirement 10.1)', () => {
  it('dựng được workbook hợp lệ, đọc lại ra đúng tiêu đề cột và dữ liệu', async () => {
    const buffer = await buildAssignmentExcelBuffer(
      makeExportData({
        rows: [
          {
            teamName: 'Nhóm Rồng Vàng',
            members: [{ memberName: 'Nguyễn Văn An', studentCode: 'SV001' }],
            finalDisplayScore: 85,
            reviewStatus: 'REVIEWED',
            gradedAt: '2024-09-02T10:00:00.000Z',
          },
          {
            teamName: 'Nhóm Chưa Chấm',
            members: [{ memberName: 'Trần Thị Bình' }],
            finalDisplayScore: NOT_GRADED_LABEL,
            reviewStatus: null,
            gradedAt: null,
          },
        ],
      }),
    );

    expect(buffer.byteLength).toBeGreaterThan(0);

    // Đọc lại file vừa dựng để chắc chắn nó là .xlsx thật, không phải byte rác.
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet('Điểm');
    expect(sheet).toBeDefined();

    const headerRow = sheet?.getRow(1);
    expect(headerRow?.getCell(1).value).toBe(EXPORT_COLUMN_HEADERS[0]);
    expect(headerRow?.getCell(4).value).toBe(EXPORT_COLUMN_HEADERS[3]);

    // Dòng 2 = thành viên nhóm đã chấm; điểm phải là số.
    expect(sheet?.getRow(2).getCell(1).value).toBe('Nhóm Rồng Vàng');
    expect(sheet?.getRow(2).getCell(3).value).toBe('SV001');
    expect(sheet?.getRow(2).getCell(4).value).toBe(85);

    // Dòng 3 = nhóm chưa chấm; ô điểm là chữ "CHƯA CHẤM" (Requirement 10.3).
    expect(sheet?.getRow(3).getCell(4).value).toBe('CHƯA CHẤM');
  });

  it('vẫn dựng được file khi đợt chấm chưa có nhóm nào', async () => {
    const buffer = await buildAssignmentExcelBuffer(makeExportData({ rows: [] }));

    expect(buffer.byteLength).toBeGreaterThan(0);
  });

  it('bọc buffer thành Blob với đúng MIME type của .xlsx', async () => {
    const blob = await buildAssignmentExcelBlob(makeExportData({ rows: [] }));

    expect(blob.size).toBeGreaterThan(0);
    // MIME sai thì trình duyệt/Excel có thể từ chối mở file.
    expect(blob.type).toBe(XLSX_MIME_TYPE);
  });
});

describe('downloadExcelFile (Requirement 10.4)', () => {
  it('tạo link tải với đúng tên file rồi thu hồi object URL', () => {
    const createObjectURL = vi.fn(() => 'blob:fake-url');
    const revokeObjectURL = vi.fn();
    // jsdom không hiện thực object URL -> stub để quan sát vòng đời.
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const clicked: { href?: string; download?: string } = {};
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = realCreateElement(tagName) as HTMLAnchorElement;
      if (tagName === 'a') {
        element.click = () => {
          clicked.href = element.href;
          clicked.download = element.download;
        };
      }
      return element;
    });

    downloadExcelFile(new Blob(['x']), 'diem-dot-1-2024-09-05.xlsx');

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicked.download).toBe('diem-dot-1-2024-09-05.xlsx');
    // Không thu hồi thì blob bị giữ trong bộ nhớ cả phiên làm việc.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    // Thẻ <a> tạm phải được dọn khỏi DOM.
    expect(document.querySelector('a[download]')).toBeNull();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
