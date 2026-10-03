/**
 * Component test cho `FileUploadField` (task 5.4).
 *
 * Kiểm tra component báo đúng `{ file, error }` lên form với từng loại input
 * sai: sai phần mở rộng (2.7), quá 5MB (2.8), chọn nhiều hơn 1 file (2.7).
 *
 * Harness giữ state thật giống cách form dùng component (controlled), và in
 * ra giá trị nhận được để test assert không cần nhìn vào nội bộ component.
 */
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileUploadField } from '../src/components/FileUploadField';
import { MAX_FILE_SIZE_BYTES, type SubmissionFileExtension } from '../src/validation';
import { makeFile } from './fixtures';
import { selectFiles } from './fileUploadTestUtils';

function Harness({ extension }: { extension: SubmissionFileExtension }) {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);

  return (
    <>
      <FileUploadField
        label={`File bài làm (${extension})`}
        extension={extension}
        value={file}
        errorText={error}
        onChange={(next) => {
          setFile(next.file);
          setError(next.error);
        }}
      />
      <output data-testid="file-name">{file?.name ?? '(chưa chọn)'}</output>
    </>
  );
}

describe('FileUploadField', () => {
  it('hiển thị nhãn và ràng buộc về loại + kích thước file', () => {
    render(<Harness extension=".md" />);

    expect(screen.getByText('File bài làm (.md)')).toBeDefined();
    // Requirement 2.6, 2.8: nói trước giới hạn thay vì để người dùng thử-sai.
    expect(screen.getByText('Chỉ nhận 1 file .md, kích thước tối đa 5MB.')).toBeDefined();
  });

  it('nhận file đúng loại và đúng kích thước mà không báo lỗi', () => {
    render(<Harness extension=".md" />);

    selectFiles('md', [makeFile('bai-lam.md')]);

    expect(screen.getByTestId('file-name').textContent).toBe('bai-lam.md');
    expect(screen.queryByText(/phần mở rộng/)).toBeNull();
    expect(screen.queryByText(/vượt quá kích thước/)).toBeNull();
  });

  it('báo lỗi khi file sai phần mở rộng (Requirement 2.7)', () => {
    render(<Harness extension=".md" />);

    selectFiles('md', [makeFile('bai-lam.txt')]);

    expect(screen.getByText('File phải có phần mở rộng .md.')).toBeDefined();
  });

  it('báo lỗi riêng cho ô .xml khi nhận file .md', () => {
    render(<Harness extension=".xml" />);

    selectFiles('xml', [makeFile('bai-lam.md')]);

    expect(screen.getByText('File phải có phần mở rộng .xml.')).toBeDefined();
  });

  it('báo lỗi khi file vượt quá 5MB, kèm kích thước thật (Requirement 2.8, 11.3)', () => {
    render(<Harness extension=".md" />);

    selectFiles('md', [makeFile('qua-lon.md', MAX_FILE_SIZE_BYTES + 1)]);

    expect(screen.getByText('File nặng 5.0MB, vượt quá kích thước tối đa 5MB.')).toBeDefined();
  });

  it('chấp nhận file đúng bằng ngưỡng 5MB (biên không bị chặn)', () => {
    render(<Harness extension=".md" />);

    selectFiles('md', [makeFile('vua-du.md', MAX_FILE_SIZE_BYTES)]);

    expect(screen.queryByText(/vượt quá kích thước/)).toBeNull();
    expect(screen.getByTestId('file-name').textContent).toBe('vua-du.md');
  });

  it('chỉ nhận 1 file dù người dùng chọn nhiều file (Requirement 2.7)', () => {
    render(<Harness extension=".md" />);

    selectFiles('md', [makeFile('mot.md'), makeFile('hai.md')]);

    // `multiple={false}` -> Cloudscape chỉ chuyển file đầu tiên lên, nên ô
    // không bao giờ giữ 2 file. Quy tắc "đúng 1 file" vì vậy được bảo đảm ở
    // mức UI, không cần (và không thể) hiện lỗi ở đây. Nhánh lỗi tương ứng
    // trong `validateSelectedFiles` là phòng vệ chiều sâu, được kiểm ở
    // `validation.test.ts`; server cũng kiểm lại độc lập.
    expect(screen.getByTestId('file-name').textContent).toBe('mot.md');
    expect(screen.queryByText(/Chỉ được chọn đúng 1 file/)).toBeNull();
  });

  it('giữ lại file sai kèm lỗi thay vì âm thầm xoá', () => {
    render(<Harness extension=".md" />);

    selectFiles('md', [makeFile('sai-loai.txt')]);

    // Người dùng vẫn thấy tên file mình vừa chọn -> biết chính xác file nào bị
    // từ chối. Việc chặn nộp do form đảm nhiệm (nó không gọi API khi còn lỗi).
    expect(screen.getByTestId('file-name').textContent).toBe('sai-loai.txt');
  });
});
