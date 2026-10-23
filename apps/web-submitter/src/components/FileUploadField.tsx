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
import { useLanguage } from '../i18n/LanguageContext';
import type { SubmissionFileExtension } from '../validation';
import { validateSelectedFiles } from '../validation';

export interface FileUploadFieldProps {
  /** Nhãn hiển thị, ví dụ "File bài làm (.md)". */
  readonly label: string;
  /** Mô tả ngắn phía dưới nhãn. */
  readonly description?: string;
  /** Phần mở rộng bắt buộc của ô này. */
  readonly extension: SubmissionFileExtension;
  /** File đang chọn (`null` = chưa chọn). */
  readonly value: File | null;
  /** Lỗi hiển thị dưới ô; do form truyền xuống. */
  readonly errorText?: string;
  /**
   * Báo lên form file vừa chọn KÈM lỗi validate (nếu có).
   */
  readonly onChange: (next: { file: File | null; error?: string }) => void;
}

export function FileUploadField({
  label,
  description,
  extension,
  value,
  errorText,
  onChange,
}: FileUploadFieldProps) {
  const { t, language } = useLanguage();
  const isVi = language === 'vi';

  return (
    <div data-testid={`file-upload-${extension.replace('.', '')}`}>
      <FormField
        label={
          <span>
            <span>{label}</span>
            <span className="fcaj-required-star">*</span>
          </span>
        }
        description={description}
      >
        <FileUpload
          value={value === null ? [] : [value]}
          onChange={({ detail }) => {
            const files = detail.value;
            onChange({
              file: files[0] ?? null,
              error: validateSelectedFiles(files, extension),
            });
          }}
          constraintText={
            extension === '.md'
              ? isVi
                ? 'Chỉ nhận 1 file .md, kích thước tối đa 2MB.'
                : 'Only 1 .md file accepted, max 2MB.'
              : isVi
                ? 'Chỉ nhận 1 file .xml, kích thước tối đa 5MB.'
                : 'Only 1 .xml file accepted, max 5MB.'
          }
          errorText={errorText}
          accept={extension}
          multiple={false}
          showFileSize
          ariaRequired
          i18nStrings={{
            uploadButtonText: () => t('fileUploadButton'),
            dropzoneText: () =>
              isVi ? `Kéo thả file ${extension} vào đây` : `Drag and drop ${extension} file here`,
            removeFileAriaLabel: () =>
              isVi ? `Xoá file ${extension} đã chọn` : `Remove selected ${extension} file`,
            errorIconAriaLabel: t('errorLabel'),
            warningIconAriaLabel: t('warningLabel'),
            limitShowFewer: t('limitShowFewer'),
            limitShowMore: t('limitShowMore'),
          }}
        />
      </FormField>
    </div>
  );
}
