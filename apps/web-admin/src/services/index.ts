/**
 * Lớp service của `web-admin` (design.md > Components and Interfaces >
 * web-admin > `services/`).
 *
 * Barrel mỏng re-export từ package dùng chung `@quick-grading/api-client`
 * (task 4), cùng lý do như bên `web-submitter`: Requirement 12.1/12.2 bắt
 * buộc component không gọi mock/API trực tiếp, và giữ 1 "cửa duy nhất" ra
 * ngoài giúp dễ soi khi review (grep import `@quick-grading/api-client`
 * ngoài thư mục này là thấy vi phạm).
 *
 * Khác `web-submitter` ở chỗ Admin được dùng TOÀN BỘ domain: ngoài
 * `assignmentsApi`/`teamsApi` còn có `gradingApi`, `rubricsApi`, `exportApi`
 * và `authApi`. Đây là khu vực đã xác thực nên việc đọc điểm/feedback là hợp
 * lệ (Requirement 6.8: điểm chỉ hiển thị ở khu vực Admin).
 */
export {
  assignmentsApi,
  authApi,
  exportApi,
  gradingApi,
  rubricsApi,
  teamsApi,
} from '@quick-grading/api-client';
