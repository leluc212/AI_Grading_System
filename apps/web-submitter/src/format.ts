/**
 * Helper format dữ liệu để hiển thị.
 *
 * Toàn bộ timestamp trong hệ thống được lưu dạng ISO8601 UTC (xem design.md
 * > Data Models), nên chỗ nào hiển thị cho người đọc cũng phải đi qua đây để
 * ra định dạng ngày/giờ Việt Nam thống nhất.
 */

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
});

/**
 * Format 1 timestamp ISO8601 thành chuỗi ngày/giờ theo locale `vi-VN`.
 *
 * Nếu chuỗi đầu vào không parse được thành ngày hợp lệ, trả về NGUYÊN chuỗi
 * gốc thay vì "Invalid Date" — dữ liệu lạ vẫn đọc được và không làm trang
 * trông như bị lỗi.
 */
export function formatDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return isoTimestamp;
  }
  return DATE_TIME_FORMATTER.format(date);
}
