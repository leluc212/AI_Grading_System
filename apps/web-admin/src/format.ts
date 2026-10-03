/**
 * Helper format dữ liệu để hiển thị ở khu vực Admin.
 *
 * Toàn bộ timestamp trong hệ thống là ISO8601 UTC (design.md > Data Models),
 * nên mọi chỗ hiển thị cho người đọc phải đi qua đây để ra định dạng
 * ngày/giờ Việt Nam thống nhất.
 */

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

/**
 * Format 1 timestamp ISO8601 thành chuỗi ngày/giờ `vi-VN`.
 *
 * Trả về nguyên chuỗi gốc nếu không parse được (thay vì "Invalid Date"), và
 * trả về dấu gạch ngang nếu không có giá trị — dùng cho các field optional
 * như `gradedAt`.
 */
export function formatDateTime(isoTimestamp: string | undefined): string {
  if (isoTimestamp === undefined || isoTimestamp.length === 0) {
    return '—';
  }
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }
  return DATE_TIME_FORMATTER.format(date);
}

/**
 * Format điểm để hiển thị. `null` (chưa có điểm) thành dấu gạch ngang thay vì
 * để trống hoặc hiện `0` — Requirement 10.3 nhấn mạnh không được để người đọc
 * nhầm "chưa chấm" với "điểm 0", và nguyên tắc đó áp dụng cho cả UI.
 */
export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return '—';
  }
  return String(score);
}
