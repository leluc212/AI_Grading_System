# AI Grading System

Web chấm bài sinh viên bằng AI. Sinh viên nộp bài theo nhóm, giảng viên chấm dựa trên rubric có thể cấu hình, kết quả xuất ra Excel.

Monorepo npm workspaces, TypeScript, React + Cloudscape Design System.

> **Trạng thái: Giai đoạn 1 — chạy local, chưa có backend thật.**
> Dữ liệu do [MSW](https://mswjs.io/) giả lập **hoàn toàn trong trình duyệt**. Không có server, không có database, không có AWS. Mỗi người mở trang nhận một bản dữ liệu riêng trong bộ nhớ, mất khi đóng tab.

## ⚠️ Lưu ý bảo mật

Khu vực Admin ở giai đoạn này dùng **mock auth, không phải bảo mật thật**:

- tài khoản cố định `admin` / `admin123`, viết thẳng trong `packages/mock-server/src/handlers/auth.ts`
- token là chuỗi giả, **không được verify**
- route guard chỉ chạy ở phía UI

Đây là chủ ý, để dựng xong luồng UX trước. Nó **không** phải lỗ hổng bị bỏ sót, và cũng không bảo vệ gì cả — vì phía sau không có dữ liệu thật nào. Giai đoạn 2 sẽ thay toàn bộ bằng Amazon Cognito.

**Đừng deploy bản này ra public rồi dùng với dữ liệu sinh viên thật.**

## Cấu trúc

```
apps/
  web-submitter/   SPA nộp bài (public, không cần đăng nhập)
  web-admin/       SPA quản trị: chấm bài, cấu hình rubric, xuất Excel
packages/
  shared-types/    type dùng chung, typed error, thang điểm
  api-client/      service layer — giai đoạn 2 chỉ đổi transport, giữ nguyên signature
  mock-server/     MSW handler (chỉ giai đoạn 1, sẽ bỏ)
docs/              tài liệu bối cảnh & checklist kiểm thử tay
```

## Chạy local

Yêu cầu Node >= 18.

```bash
npm install

# Trang nộp bài  -> http://localhost:5173
npm run dev --workspace @quick-grading/web-submitter

# Trang quản trị -> http://localhost:5174
npm run dev --workspace @quick-grading/web-admin
```

Hai lệnh `dev` chạy ở hai terminal riêng. MSW tự khởi động ở chế độ dev; nếu nó lỗi, trang sẽ hiện thông báo thay vì render app rỗng.

## Kiểm thử & chất lượng code

```bash
npm test          # 352 test, chạy toàn bộ workspace
npm run typecheck
npm run lint
npm run format:check
```

## Lộ trình

| Giai đoạn | Nội dung                                                                        | Trạng thái                 |
| --------- | ------------------------------------------------------------------------------- | -------------------------- |
| 1         | UI đầy đủ + mock server, chạy local                                             | gần xong, còn kiểm thử tay |
| 2         | Lên AWS: S3 + CloudFront, API Gateway, Lambda, DynamoDB, SQS, Cognito (qua CDK) | chưa bắt đầu               |
| 3         | Nối AI Grader thật thay cho response giả lập                                    | chưa bắt đầu               |

## Giấy phép

Chưa chọn. Hiện tại mặc định là bản quyền thuộc tác giả, chưa cấp quyền sử dụng lại.
