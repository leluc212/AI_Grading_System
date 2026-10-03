/**
 * Xuất điểm của 1 Assignment ra file `.xlsx` ở PHÍA CLIENT (task 11.1, 11.2).
 *
 * Giai đoạn 1 chưa có Lambda export thật: `exportApi.getAssignmentExportData`
 * chỉ lấy dữ liệu nguồn dạng JSON, còn việc dựng workbook diễn ra ngay trong
 * trình duyệt bằng `exceljs`. Giai đoạn 2 muốn chuyển sang Lambda thì chỉ cần
 * đổi chỗ gọi: phần `buildSheetRows` dưới đây là hàm thuần nên dùng lại được
 * ở server.
 *
 * ## Vì sao `exceljs` chứ không phải `xlsx`
 *
 * `tasks.md` gợi ý 1 trong 2. Bản `xlsx` trên npm dừng ở 0.18.5 và đang có
 * advisory mức high (prototype pollution, ReDoS) vì SheetJS không còn publish
 * lên npm registry. `exceljs` 4.4.0 vẫn được bảo trì nên là lựa chọn an toàn
 * hơn cho 1 dependency chạy trong trình duyệt.
 *
 * ## Vì sao mỗi thành viên 1 dòng
 *
 * Requirement 10.2 đòi file phải có "tên và MSSV của TỪNG thành viên". Có 2
 * cách: 1 dòng/nhóm với danh sách thành viên gộp vào 1 ô, hoặc 1 dòng/thành
 * viên. Chọn cách thứ hai vì mục đích của việc xuất file (user story Yêu cầu
 * 10) là "đưa dữ liệu điểm vào hệ thống bảng điểm của trường" — bảng điểm
 * trường tính theo từng sinh viên, nên 1 dòng/sinh viên dán vào là dùng được
 * ngay, không phải tách ô. Điểm của nhóm được lặp lại trên mọi dòng của nhóm
 * đó (đúng: cả nhóm cùng 1 điểm, theo Requirement 6.7).
 *
 * _Requirements: 7.6, 10.1, 10.2, 10.3, 10.4_
 */
import type { AssignmentExportData, ExportRow } from '@quick-grading/api-client';
import { NOT_GRADED_LABEL } from '@quick-grading/api-client';
import type { ReviewStatus } from '@quick-grading/shared-types';
import { formatDateTime } from './format';

/** Nhãn tiếng Việt cho trạng thái review trong file Excel. */
const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  NOT_REQUIRED: 'Không cần review',
  PENDING_REVIEW: 'Chờ review',
  REVIEWED: 'Đã review',
};

/** Giá trị cho ô không có dữ liệu (nhóm chưa chấm). Dấu gạch chứ không để trống. */
const EMPTY_CELL = '—';

/** Tiêu đề các cột, đúng thứ tự xuất ra file — Requirement 10.2. */
export const EXPORT_COLUMN_HEADERS = [
  'Tên nhóm',
  'Tên sinh viên',
  'MSSV',
  'Điểm cuối',
  'Trạng thái review',
  'Thời điểm chấm',
] as const;

/**
 * 1 dòng dữ liệu đã format sẵn để ghi vào sheet.
 *
 * `finalScore` giữ kiểu `number | string`: khi có điểm thì ghi SỐ thật (để
 * Excel tính toán/sắp xếp được), khi chưa chấm thì ghi chuỗi `'CHƯA CHẤM'`
 * (Requirement 10.3 — không để trống gây nhầm với điểm 0).
 */
export interface ExportSheetRow {
  teamName: string;
  memberName: string;
  studentCode: string;
  finalScore: number | string;
  reviewStatus: string;
  gradedAt: string;
}

/** Format 1 `ExportRow` của server thành các dòng sheet (1 dòng/thành viên). */
function toSheetRows(row: ExportRow): ExportSheetRow[] {
  const finalScore =
    row.finalDisplayScore === NOT_GRADED_LABEL ? NOT_GRADED_LABEL : row.finalDisplayScore;
  const reviewStatus =
    row.reviewStatus === null ? EMPTY_CELL : REVIEW_STATUS_LABELS[row.reviewStatus];
  const gradedAt = row.gradedAt === null ? EMPTY_CELL : formatDateTime(row.gradedAt);

  // Nhóm không có thành viên nào lẽ ra không tồn tại (Requirement 2.3 buộc tối
  // thiểu 1), nhưng vẫn xuất 1 dòng để nhóm đó không BIẾN MẤT khỏi báo cáo —
  // thiếu nhóm trong bảng điểm khó phát hiện hơn là thấy 1 dòng trống tên.
  if (row.members.length === 0) {
    return [
      {
        teamName: row.teamName,
        memberName: EMPTY_CELL,
        studentCode: EMPTY_CELL,
        finalScore,
        reviewStatus,
        gradedAt,
      },
    ];
  }

  return row.members.map((member) => ({
    teamName: row.teamName,
    memberName: member.memberName,
    // MSSV là tuỳ chọn (Requirement 2.2).
    studentCode: member.studentCode ?? EMPTY_CELL,
    finalScore,
    reviewStatus,
    gradedAt,
  }));
}

/**
 * Chuyển toàn bộ dữ liệu export thành danh sách dòng sheet.
 *
 * Hàm thuần, không phụ thuộc `exceljs` — đây là nơi chứa toàn bộ quy tắc
 * format nên kiểm thử được mà không cần dựng workbook.
 */
export function buildSheetRows(data: AssignmentExportData): ExportSheetRow[] {
  return data.rows.flatMap(toSheetRows);
}

/**
 * Tên file tải về: `diem-<ten-dot-cham>-<yyyy-mm-dd>.xlsx`.
 *
 * Tên đợt chấm được chuẩn hoá bỏ dấu và ký tự đặc biệt vì tên file có dấu
 * tiếng Việt dễ bị lỗi encoding khi mở trên máy khác / hệ thống khác.
 */
export function buildExcelFileName(assignmentName: string, now: Date = new Date()): string {
  const slug = assignmentName
    .normalize('NFD')
    // Bỏ dấu thanh/dấu phụ (U+0300-U+036F) sau khi tách tổ hợp ở bước NFD.
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const datePart = now.toISOString().slice(0, 10);
  const namePart = slug.length > 0 ? slug : 'dot-cham';
  return `diem-${namePart}-${datePart}.xlsx`;
}

/** MIME type của file `.xlsx`. */
export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Dựng workbook `.xlsx` và trả về nội dung nhị phân.
 *
 * Tách khỏi `buildAssignmentExcelBlob` (phần bọc thành `Blob`) vì buffer là
 * thứ KHÔNG phụ thuộc môi trường: test đọc lại được bằng `exceljs` để kiểm
 * file sinh ra có hợp lệ thật hay không (jsdom `Blob` không có
 * `arrayBuffer()`), và giai đoạn 2 nếu chuyển việc dựng file sang Lambda thì
 * dùng lại y nguyên hàm này.
 *
 * `exceljs` được import ĐỘNG để nó không nằm trong bundle khởi động: thư viện
 * này khá nặng và chỉ cần khi Admin thực sự bấm xuất file.
 */
export async function buildAssignmentExcelBuffer(data: AssignmentExportData): Promise<ArrayBuffer> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Điểm');

  sheet.columns = [
    { header: EXPORT_COLUMN_HEADERS[0], key: 'teamName', width: 28 },
    { header: EXPORT_COLUMN_HEADERS[1], key: 'memberName', width: 24 },
    { header: EXPORT_COLUMN_HEADERS[2], key: 'studentCode', width: 14 },
    { header: EXPORT_COLUMN_HEADERS[3], key: 'finalScore', width: 12 },
    { header: EXPORT_COLUMN_HEADERS[4], key: 'reviewStatus', width: 20 },
    { header: EXPORT_COLUMN_HEADERS[5], key: 'gradedAt', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  // Đóng băng dòng tiêu đề để cuộn danh sách dài vẫn thấy tên cột.
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  for (const row of buildSheetRows(data)) {
    sheet.addRow(row);
  }

  return workbook.xlsx.writeBuffer();
}

/** Bọc nội dung workbook thành `Blob` để trình duyệt tải xuống. */
export async function buildAssignmentExcelBlob(data: AssignmentExportData): Promise<Blob> {
  const buffer = await buildAssignmentExcelBuffer(data);
  return new Blob([buffer], { type: XLSX_MIME_TYPE });
}

/**
 * Lấy dữ liệu + dựng file, trả về `Blob` kèm tên file đề xuất.
 *
 * Tách khỏi việc tải xuống (`downloadExcelFile`) để hàm này không có side
 * effect nào lên DOM — nhờ vậy kiểm thử được và dùng lại được nếu sau này
 * cần gửi file đi chỗ khác thay vì tải về.
 *
 * Ghi chú so với design.md: contract ở đó ghi
 * `exportApi.exportAssignmentToExcel(assignmentId): Promise<Blob>`. Việc lấy
 * dữ liệu nguồn đã nằm ở `api-client` (`getAssignmentExportData`), nên hàm
 * tương ứng được đặt tại app này và trả thêm `fileName` — thông tin mà chỗ
 * gọi cần và `Blob` không mang theo được.
 */
export async function exportAssignmentToExcel(
  data: AssignmentExportData,
): Promise<{ blob: Blob; fileName: string }> {
  const blob = await buildAssignmentExcelBlob(data);
  return { blob, fileName: buildExcelFileName(data.assignmentName) };
}

/**
 * Kích hoạt tải file xuống từ trình duyệt (Requirement 10.4).
 *
 * Dùng thẻ `<a download>` tạm + object URL: đây là cách duy nhất tải 1 `Blob`
 * sinh ở client mà không cần server. Luôn `revokeObjectURL` sau khi click để
 * không giữ blob trong bộ nhớ cả phiên làm việc.
 */
export function downloadExcelFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    // Phải nằm trong document mới click được trên Firefox.
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
