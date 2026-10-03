/**
 * `FileUploadField` — 1 ô chọn file có validate loại + kích thước (task 5.4).
 *
 * Bọc Cloudscape `FileUpload` và gắn thêm quy tắc nghiệp vụ ở
 * `src/validation.ts`. Dùng `multiple={false}` + `accept` để trình duyệt tự
 * giới hạn ngay trong hộp thoại chọn file, nhưng KHÔNG dựa vào đó: thuộc tính
 * `accept` chỉ là gợi ý lọc, người dùng vẫn có thể chọn "All files". Nên
 * component luôn tự kiểm tra lại tên + kích thước sau khi chọn.
 *
 * Riêng quy tắc "đúng 1 file mỗi loại" (Requirement 2.7) thì `multiple={false}`
 * xử lý trọn: Cloudscape chỉ chuyển file ĐẦU TIÊN vào `onChange`, nên ô này
 * không bao giờ giữ 2 file. Nhánh kiểm `files.length > 1` trong
 * `validateSelectedFiles` vì vậy là phòng vệ chiều sâu (và là nơi quy tắc được
 * ghi tường minh), chứ không phải đường chạy thường gặp.
 *
 * Quy ước quan trọng — **file sai vẫn được giữ lại trên UI kèm lỗi**, thay vì
 * âm thầm loại bỏ. Lý do: nếu xoá luôn, người dùng thấy ô trống và không hiểu
 * vừa xảy ra chuyện gì; giữ lại tên file + câu lỗi thì họ biết chính xác file
 * nào bị từ chối và vì sao. Việc "từ chối" (Requirement 2.7, 2.8) được bảo
 * đảm ở chỗ khác: lỗi này được báo lên form, và form chặn không gọi API khi
 * còn lỗi — nên file sai không bao giờ được nộp.
 *
 * Component là controlled và không giữ state: `value` + `errorText` do form
 * sở hữu (giống `MemberListEditor`), vì form cần validate lại toàn bộ khi bấm
 * nộp, kể cả ô mà người dùng chưa chạm vào.
 *
 * _Requirements: 2.6, 2.7, 2.8, 11.3_
 */
import FileUpload from '@cloudscape-design/components/file-upload';
import FormField from '@cloudscape-design/components/form-field';
import type { SubmissionFileExtension } from '../validation';
import { validateSelectedFiles } from '../validation';

export interface FileUploadFieldProps {
  /** Nhãn hiển thị, ví dụ "File bài làm (.md)". */
  label: string;
  /** Mô tả ngắn phía dưới nhãn. */
  description?: string;
  /** Phần mở rộng bắt buộc của ô này. */
  extension: SubmissionFileExtension;
  /** File đang chọn (`null` = chưa chọn). */
  value: File | null;
  /** Lỗi hiển thị dưới ô; do form truyền xuống. */
  errorText?: string;
  /**
   * CỐ TÌNH KHÔNG có prop `disabled`: Cloudscape `FileUpload` không hỗ trợ
   * disable (khác `Input`), nên nếu khai báo ở đây thì đó là prop không có
   * tác dụng — tệ hơn là không có. Trong lúc form đang gửi request, việc
   * người dùng đổi file cũng không ảnh hưởng gì vì `FormData` đã được dựng và
   * gửi đi từ trước.
   */
  /**
   * Báo lên form file vừa chọn KÈM lỗi validate (nếu có).
   *
   * Gộp 2 thứ vào 1 callback (thay vì `onChange` + `onError` riêng) để form
   * luôn cập nhật file và lỗi trong cùng 1 lần render — không có khoảnh khắc
   * state lệch nhau kiểu "đã có file mới nhưng lỗi vẫn của file cũ".
   */
  onChange: (next: { file: File | null; error?: string }) => void;
}

export function FileUploadField({
  label,
  description,
  extension,
  value,
  errorText,
  onChange,
}: FileUploadFieldProps) {
  return (
    // `data-testid` trên wrapper: Cloudscape `FileUpload` không nhận
    // `data-*`, mà `<input type="file">` bên trong bị ẩn. Bọc 1 lớp div cho
    // test tìm được đúng ô trong 2 ô upload của form.
    <div data-testid={`file-upload-${extension.replace('.', '')}`}>
      {/*
        Nhãn + mô tả phải đến từ `FormField`: `FileUpload` CỐ TÌNH không có
        prop `label`/`description` (nó chỉ nhận `constraintText`/`errorText`),
        và `FormField` lo phần liên kết nhãn với control cho screen reader.
        Lỗi thì đặt trên `FileUpload` chứ không phải `FormField` để câu lỗi
        hiện ngay cạnh danh sách file đã chọn, không bị tách rời khỏi ô.
      */}
      <FormField label={label} description={description}>
        <FileUpload
          value={value === null ? [] : [value]}
          onChange={({ detail }) => {
            const files = detail.value;
            onChange({
              file: files[0] ?? null,
              error: validateSelectedFiles(files, extension),
            });
          }}
          // Nói trước giới hạn để người dùng không phải thử - sai mới biết
          // (Requirement 2.6, 2.8).
          constraintText={`Chỉ nhận 1 file ${extension}, kích thước tối đa 5MB.`}
          errorText={errorText}
          accept={extension}
          multiple={false}
          showFileSize
          ariaRequired
          i18nStrings={{
            uploadButtonText: () => 'Chọn file',
            dropzoneText: () => `Kéo thả file ${extension} vào đây`,
            removeFileAriaLabel: () => `Xoá file ${extension} đã chọn`,
            errorIconAriaLabel: 'Lỗi',
            warningIconAriaLabel: 'Cảnh báo',
            limitShowFewer: 'Hiện ít hơn',
            limitShowMore: 'Hiện thêm',
          }}
        />
      </FormField>
    </div>
  );
}
