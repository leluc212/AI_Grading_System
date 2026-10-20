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
npm test          # chạy toàn bộ test workspace
npm run typecheck
npm run lint
npm run format:check
```

## Chạy với backend thật (dev stack)

Hạ tầng serverless chạy trên AWS (`ap-southeast-1`): DynamoDB, S3, Lambda `public-api`, HTTP API Gateway, CloudWatch Alarms, SNS topic, Budgets.

### 1. Điều kiện tiên quyết

- AWS CLI đã cấu hình profile `quick-grading` (account `497320113384`).
- Bootstrap CDK một lần cho môi trường (dùng profile `default`):
  ```bash
  npx cdk bootstrap aws://497320113384/ap-southeast-1 --profile default
  ```

### 2. Triển khai stack dev

```bash
npm run deploy:dev --workspace @quick-grading/infra
```

- **SNS Email**: Sau khi deploy, kiểm tra hộp thư email (mặc định `swat.lucle@gmail.com`) và nhấn link xác nhận đăng ký SNS topic cảnh báo.
- **Tùy chỉnh email cảnh báo**: Thêm `-c alarmEmails=email1@domain.com,email2@domain.com` hoặc chỉnh trong `infra/cdk.json` rồi deploy lại.
- **Ngân sách (Budget)**: Mặc định cảnh báo ở các mốc 50%/80%/100% của 10 USD/tháng (ngân sách tính ở cấp tài khoản).
- **Lưu ý Phase 1**: Khóa OpenAI key chưa dùng ở Phase 1 (sẽ dùng ở Phase 2 khi nối chấm tự động).

### 3. Nạp dữ liệu mẫu (Seed)

```bash
npm run seed:dev --workspace @quick-grading/api-service
```

Lệnh này sẽ nạp 2 đợt chấm mẫu vào DynamoDB:

- `a1111111-1111-4111-8111-111111111111` (OPEN - Đợt 1 Lập trình Web)
- `a2222222-2222-4222-8222-222222222222` (CLOSED - Đợt 2 Cấu trúc dữ liệu)

### 4. Kết nối `web-submitter` với backend thật

1. Lấy giá trị `ApiUrl` từ output của lệnh deploy CDK (ví dụ: `https://abcxyz.execute-api.ap-southeast-1.amazonaws.com`).
2. Tạo file `apps/web-submitter/.env.local` (không có dấu gạch chéo `/` ở cuối):
   ```env
   VITE_API_BASE_URL=https://abcxyz.execute-api.ap-southeast-1.amazonaws.com
   ```
3. Khởi động ứng dụng nộp bài:
   ```bash
   npm run dev --workspace @quick-grading/web-submitter
   ```
4. Truy cập `http://localhost:5173/submit/a1111111-1111-4111-8111-111111111111` để thử nộp bài thật lên S3 + DynamoDB.
   _(Nếu không có file `.env.local`, ứng dụng sẽ tự động fallback sang chế độ mock MSW offline)._

## Lộ trình

| Giai đoạn | Nội dung                                                                        | Trạng thái                 |
| --------- | ------------------------------------------------------------------------------- | -------------------------- |
| 1         | UI đầy đủ + mock server, chạy local                                             | gần xong, còn kiểm thử tay |
| 2         | Lên AWS: S3 + CloudFront, API Gateway, Lambda, DynamoDB, SQS, Cognito (qua CDK) | chưa bắt đầu               |
| 3         | Nối AI Grader thật thay cho response giả lập                                    | chưa bắt đầu               |

## Giấy phép

Chưa chọn. Hiện tại mặc định là bản quyền thuộc tác giả, chưa cấp quyền sử dụng lại.
