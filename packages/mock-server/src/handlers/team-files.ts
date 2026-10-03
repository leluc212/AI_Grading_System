/**
 * MSW handler cho `getTeamFiles` (task 3.7) — trả về NỘI DUNG (không phải
 * metadata) của 2 file mới nhất (`.md` + `.xml`) của 1 Team, để trang Admin
 * render trực tiếp (Requirement 5.3, 5.4) mà không cần tải file.
 *
 * Endpoint tương ứng design.md > API Contract (Service Layer):
 *   - GET /api/teams/:teamId/files -> getTeamFiles(teamId): Promise<{ md: string; xml: string }>
 *
 * ## Giới hạn quan trọng của giai đoạn 1 (đọc kỹ trước khi sửa file này)
 *
 * `buildS3Key` (xem `submissions.ts`) lưu `SubmissionFile.s3Key` bằng
 * `URL.createObjectURL(file)` — 1 blob URL chỉ tồn tại trong đúng session
 * trình duyệt hiện tại (gắn với `document`/Service Worker registration hiện
 * tại), KHÔNG được persist cùng nội dung thật. Trong khi đó, `db.ts` lại
 * persist `s3Key` (chuỗi blob URL) vào `localStorage` để "sống sót" qua lần
 * refresh trang.
 *
 * Hệ quả: nếu Submitter nộp bài rồi Admin **refresh trang** (hoặc mở lại
 * trình duyệt) trước khi xem file, blob URL cũ đã bị trình duyệt revoke —
 * `fetch(blobUrl)` sẽ thất bại dù `s3Key` trong `localStorage` vẫn còn đó.
 * Đây là hạn chế đã biết, được design.md > Migration Notes ghi rõ sẽ thay
 * bằng presigned S3 URL ở giai đoạn 2 (không cần blob URL sống qua session
 * nữa). Handler này xử lý gracefully bằng cách fallback về placeholder
 * string thay vì crash — xem `readFileContent` dưới đây.
 *
 * Trường hợp thứ 2 (hiếm, phòng thủ): nếu `URL.createObjectURL` không tồn
 * tại ở môi trường chạy `buildS3Key` (ví dụ handler chạy trong Node/Vitest
 * không có DOM), `s3Key` sẽ là fallback string `mock/${teamId}/${fileName}`
 * — chuỗi này không phải blob URL nên không thể fetch để lấy lại nội dung
 * thật (nội dung file chưa từng được lưu ở đâu cả). Handler cũng trả
 * placeholder cho trường hợp này.
 *
 * Lỗi trả về theo format `{ code, message }` (xem design.md > Error
 * Handling), tái dùng trực tiếp typed error class ở `shared-types`.
 *
 * _Requirements: 5.3, 5.4_
 */
import { http, HttpResponse } from 'msw';
import type { SubmissionFile } from '@quick-grading/shared-types';
import { DomainError, NotFoundError, ValidationError } from '@quick-grading/shared-types';
import { getDb } from '../db.js';

/** Chuyển 1 typed `DomainError` thành response `{ code, message }` đúng httpStatus của nó */
function errorResponse(error: DomainError) {
  return HttpResponse.json(
    { code: error.code, message: error.message },
    { status: error.httpStatus },
  );
}

/**
 * Đọc nội dung thật của 1 `SubmissionFile` từ `s3Key`.
 *
 * - Nếu `s3Key` là blob URL (`blob:...`, sinh từ `URL.createObjectURL`):
 *   dùng `fetch(s3Key)` rồi `.text()` — đây là cách chuẩn để đọc lại nội
 *   dung 1 object URL trong môi trường browser/Service Worker.
 * - Nếu fetch thất bại (blob URL đã bị revoke, ví dụ sau khi refresh trang
 *   — xem giới hạn ở đầu file) hoặc `s3Key` không phải blob URL (fallback
 *   key giả `mock/...`): trả về 1 placeholder rõ ràng thay vì crash, để
 *   Admin vẫn thấy được lý do vì sao không có nội dung thay vì lỗi 500.
 */
async function readFileContent(file: SubmissionFile): Promise<string> {
  if (file.s3Key.startsWith('blob:')) {
    try {
      const response = await fetch(file.s3Key);
      return await response.text();
    } catch {
      // Blob URL không còn resolve được (phổ biến nhất: đã bị revoke do
      // refresh trang/đóng session — object URL không sống qua persist
      // localStorage). Fallback graceful, không throw.
      return `[Không thể đọc lại nội dung file "${file.fileName}" — object URL tạm đã hết hiệu lực (thường do trang đã được tải lại sau khi nộp bài). Giới hạn này sẽ được khắc phục ở giai đoạn 2 bằng presigned S3 URL.]`;
    }
  }

  // `s3Key` là fallback mock key (`mock/${teamId}/${fileName}`) — nội dung
  // file thật chưa từng được lưu ở đâu cả trong trường hợp phòng thủ này.
  return `[Không có nội dung file thật — s3Key là placeholder: ${file.s3Key}]`;
}

export const teamFilesHandlers = [
  // GET /api/teams/:teamId/files — Requirement 5.3, 5.4
  http.get('/api/teams/:teamId/files', async ({ params }) => {
    const teamId = params.teamId as string;

    const team = getDb().teams.find((t) => t.teamId === teamId);
    if (!team) {
      return errorResponse(new NotFoundError('Team', teamId));
    }

    // Lấy đúng bản ghi mới nhất (`isLatest === true`) cho mỗi loại file —
    // khớp với Property 4 (design.md): lịch sử nộp bài cũ vẫn còn trong db
    // (`isLatest = false`) nhưng trang xem file chỉ quan tâm bản mới nhất.
    const latestMd = getDb().submissionFiles.find(
      (f) => f.teamId === teamId && f.fileType === 'md' && f.isLatest,
    );
    const latestXml = getDb().submissionFiles.find(
      (f) => f.teamId === teamId && f.fileType === 'xml' && f.isLatest,
    );

    if (!latestMd || !latestXml) {
      // Nhóm chưa nộp đủ 2 file (chưa nộp bài lần nào, hoặc dữ liệu không
      // nhất quán) — không có gì để hiển thị.
      return errorResponse(new ValidationError('Nhóm chưa nộp đủ 2 file.'));
    }

    const [md, xml] = await Promise.all([readFileContent(latestMd), readFileContent(latestXml)]);

    return HttpResponse.json({ md, xml }, { status: 200 });
  }),
];
