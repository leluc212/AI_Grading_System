/**
 * Lớp service của `web-submitter` (design.md > Components and Interfaces >
 * web-submitter > `services/`).
 *
 * Đây CỐ Ý chỉ là 1 barrel mỏng re-export từ package dùng chung
 * `@quick-grading/api-client` (task 4) thay vì viết lại `fetch` cho riêng
 * app này. Lý do:
 *
 *   - Requirement 12.1/12.2: component UI không bao giờ gọi mock/API trực
 *     tiếp, mọi lời gọi dữ liệu đi qua lớp service theo domain. Giữ 1 module
 *     `services/` trong app làm "cửa duy nhất" ra ngoài giúp quy tắc đó dễ
 *     soi khi review (chỉ cần grep import `@quick-grading/api-client` ngoài
 *     thư mục này là biết có vi phạm).
 *   - Giai đoạn 2 đổi sang API Gateway thật chỉ cần sửa `api-client`, app
 *     không đổi import nào (design.md > Migration Notes).
 *   - Là nơi duy nhất để mock trong component test (`vi.mock('../services')`).
 *
 * **Chỉ re-export đúng 2 domain mà Submitter được phép dùng**:
 * `assignmentsApi` (chọn đợt chấm đang mở) và `teamsApi` (nộp bài). CỐ TÌNH
 * KHÔNG re-export `gradingApi` / `exportApi` / `rubricsApi` / `authApi` —
 * khu vực public không có đường nào đọc điểm, feedback hay dữ liệu Admin
 * (Requirement 6.8, 11.1). Nếu sau này có code trong app này cần tới chúng,
 * đó là dấu hiệu sai thiết kế, không phải thiếu export.
 */
export { assignmentsApi, teamsApi } from '@quick-grading/api-client';
