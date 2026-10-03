/**
 * Tiện ích chọn file trong test (dùng cho `FileUploadField` và form nộp bài).
 *
 * Vì sao dùng `fireEvent.change` thay cho `userEvent.upload`:
 *
 *   1. `userEvent.upload` LỌC file theo thuộc tính `accept` của input. Ô `.md`
 *      có `accept=".md"`, nên nếu test muốn mô phỏng việc người dùng chọn
 *      `bai-lam.txt` thì `userEvent.upload` sẽ âm thầm bỏ qua file đó và test
 *      không kiểm được gì. Trong thực tế `accept` chỉ là bộ lọc gợi ý —
 *      người dùng đổi sang "All files" là chọn được file bất kỳ. Đó chính là
 *      kịch bản Requirement 2.7 cần chặn, nên test phải tái hiện được nó.
 *   2. Input file bên trong Cloudscape `FileUpload` bị ẩn về mặt thị giác,
 *      nên các kiểm tra khả kiến của `userEvent` dễ gây nhiễu.
 *
 * `files` phải gán qua `defineProperty` vì `HTMLInputElement.files` là
 * thuộc tính chỉ-đọc — gán thẳng `input.files = ...` không có tác dụng.
 */
import { fireEvent, screen } from '@testing-library/react';

/** Lấy `<input type="file">` ẩn bên trong 1 `FileUploadField`. */
export function getFileInput(extension: 'md' | 'xml'): HTMLInputElement {
  const wrapper = screen.getByTestId(`file-upload-${extension}`);
  const input = wrapper.querySelector('input[type="file"]');
  if (input === null) {
    throw new Error(`Không tìm thấy input file trong ô .${extension}`);
  }
  return input as HTMLInputElement;
}

/** Mô phỏng người dùng chọn `files` cho ô upload tương ứng. */
export function selectFiles(extension: 'md' | 'xml', files: File[]): void {
  const input = getFileInput(extension);
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  fireEvent.change(input);
}
