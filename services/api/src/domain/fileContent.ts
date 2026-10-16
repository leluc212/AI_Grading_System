/**
 * Kiểm tra nhẹ phần đầu file đã upload (infra-plan mục 5). XML là dữ liệu
 * không tin cậy: KHÔNG parse (không có rủi ro entity expansion/XXE), chỉ
 * kiểm tra ký tự đầu tiên.
 */
import type { FileType } from '@quick-grading/shared-types';
import { ValidationError } from '@quick-grading/shared-types';

export function assertFileHead(fileType: FileType, bytes: Uint8Array): void {
  if (fileType === 'md') {
    if (bytes.includes(0)) {
      throw new ValidationError('File .md không phải file văn bản hợp lệ.', 'mdFile');
    }
    return;
  }

  let i = 0;
  // Bỏ UTF-8 BOM.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    i = 3;
  }
  // Bỏ khoảng trắng: space, tab, LF, CR.
  while (i < bytes.length && [0x20, 0x09, 0x0a, 0x0d].includes(bytes[i])) {
    i += 1;
  }
  if (i >= bytes.length || bytes[i] !== 0x3c /* '<' */) {
    throw new ValidationError('File .xml phải bắt đầu bằng ký tự "<".', 'xmlFile');
  }
}
