# Checklist kiểm thử tay — Giai đoạn 1 (task 12.2)

Tài liệu này là phần chuẩn bị cho task 12.2. Việc **bấm thật trên trình duyệt**
không thể tự động hoá trong phạm vi task này (cần người mở 2 app, kéo thả file,
quan sát giao diện), nên phần tự động hoá được hoàn thành bằng test
`packages/api-client/test/endToEndFlow.test.ts` — nó chốt rằng chuỗi lời gọi
service layer + mock handler khớp nhau từ đầu tới cuối. Checklist dưới đây là
phần còn lại: xác nhận tầng UI.

## Chuẩn bị

Chạy 2 app song song ở 2 terminal:

```sh
npm run dev --workspace @quick-grading/web-submitter   # http://localhost:5173
npm run dev --workspace @quick-grading/web-admin       # http://localhost:5174
```

Tài khoản Admin của mock server: `admin` / `admin123`
(xem `packages/mock-server/src/handlers/auth.ts`).

Mock data được persist trong `localStorage`. Để bắt đầu lại từ seed sạch: mở
DevTools > Application > Local Storage, xoá key `quick-grading-mock-db`, rồi
tải lại trang.

> **Lưu ý về nội dung file**: `s3Key` của file vừa nộp là blob URL chỉ sống
> trong session hiện tại. Nếu tải lại trang Admin trước khi xem file, phần xem
> nội dung sẽ hiện thông báo "object URL tạm đã hết hiệu lực" — đây là hạn chế
> đã biết của giai đoạn 1, sẽ hết khi chuyển sang presigned S3 URL ở giai đoạn 2
> (xem `packages/mock-server/src/handlers/team-files.ts`).

## Luồng end-to-end

| # | Bước | Kỳ vọng | Yêu cầu | Kết quả |
| - | ---- | ------- | ------- | ------- |
| 1 | Mở app Admin khi chưa đăng nhập | Bị đẩy về trang đăng nhập | 4.1, 4.5 | ☐ |
| 2 | Đăng nhập sai mật khẩu | Hiện "Tài khoản hoặc mật khẩu không đúng.", ô mật khẩu bị xoá, vẫn ở trang đăng nhập | 4.4 | ☐ |
| 3 | Đăng nhập đúng | Vào trang "Đợt chấm", thanh trên hiện tên `admin` | 4.1 | ☐ |
| 4 | Bấm "Tạo đợt chấm", để tên trống rồi bấm Tạo | Hiện lỗi "Tên đợt chấm không được để trống.", không tạo gì | 1.2 | ☐ |
| 5 | Tạo đợt chấm "Đợt kiểm thử" | Đợt mới xuất hiện, trạng thái "Đang mở", số nhóm đã nộp = 0 | 1.1, 1.3 | ☐ |
| 6 | Mở app Submitter | Thấy "Đợt kiểm thử" trong danh sách; đợt `CLOSED` KHÔNG xuất hiện | 1.7 | ☐ |
| 7 | Bấm "Nộp bài", bấm Nộp khi form trống | Hiện lỗi inline ở tên nhóm, tên/email thành viên, và cả 2 ô file | 2.9 | ☐ |
| 8 | Thêm 2 thành viên rồi xoá 1 | Dòng bị xoá mất đi, dữ liệu dòng còn lại giữ nguyên; còn 1 thành viên thì không còn nút xoá | 2.3, 2.4 | ☐ |
| 9 | Chọn file `.txt` cho ô `.md` | Hiện "File phải có phần mở rộng .md.", không nộp được | 2.7 | ☐ |
| 10 | Chọn file `.md` lớn hơn 5MB | Hiện lỗi vượt kích thước kèm số MB thật | 2.8, 11.3 | ☐ |
| 11 | Điền hợp lệ (1 thành viên, 2 file đúng) rồi nộp | Chuyển sang trang "Đã nộp bài thành công", hiện tên nhóm + 2 tên file | 2.9 | ☐ |
| 12 | Nộp lại lần nữa với CÙNG tên nhóm | Bị chặn: "Nhóm ... đã nộp bài, vui lòng liên hệ Admin nếu cần nộp lại." | 2.12 | ☐ |
| 13 | Mở thẳng URL `/submit-success` (gõ tay) | Bị đưa về danh sách đợt chấm, KHÔNG hiện "thành công" | 2.10 | ☐ |
| 14 | Về app Admin, tải lại trang "Đợt chấm" | Số nhóm đã nộp của "Đợt kiểm thử" = 1 | 1.3 | ☐ |
| 15 | Bấm "Đóng" đợt chấm | Trạng thái thành "Đã đóng", hiện thông báo xác nhận | 1.4 | ☐ |
| 16 | Về app Submitter, tải lại danh sách | Đợt đã đóng không còn trong danh sách | 1.7 | ☐ |
| 17 | Gõ tay URL `/submit/<id-đợt-đã-đóng>` | Hiện "Đợt chấm đã đóng", KHÔNG render form | 1.8 | ☐ |
| 18 | Về Admin, bấm "Mở lại" đợt chấm | Trạng thái về "Đang mở" | 1.5 | ☐ |
| 19 | Bấm tên đợt chấm để vào dashboard nhóm | Thấy nhóm vừa nộp: số thành viên, "Đã nộp", "Chưa chấm", điểm "—" | 5.1 | ☐ |
| 20 | Lọc theo "Cần review" | Danh sách trống kèm thông báo "Không có nhóm nào khớp bộ lọc" + nút xoá bộ lọc | 5.2 | ☐ |
| 21 | Bấm tên nhóm để vào chi tiết | Thấy tên/email/MSSV thành viên; MSSV trống hiện "—" | 5.3 | ☐ |
| 22 | Xem tab "Bài làm (.md)" | Markdown được render có định dạng (tiêu đề to, không phải chữ `#`) | 5.4 | ☐ |
| 23 | Xem tab "Bài làm (.xml)" | XML hiện có màu phân biệt thẻ / thuộc tính / giá trị | 5.4 | ☐ |
| 24 | Bấm "Chấm bài" | Nút chuyển sang vô hiệu, hiện "Đang chấm bài..."; sau ~2s tự hiện điểm + nhận xét AI mà KHÔNG cần tải lại trang | 6.1, 6.2, 6.4 | ☐ |
| 25 | Bấm "Chấm bài" liên tục 2 lần thật nhanh | Lượt thứ hai bị chặn (nút vô hiệu, hoặc hiện "Nhóm này đang được chấm bài") | 6.3 | ☐ |
| 26 | Nếu kết quả có "Cần review" | Hiện khối "Cần review" với điểm AI + nhận xét, cùng trang với nội dung file | 7.1, 7.2 | ☐ |
| 27 | Chọn "Sửa điểm", nhập `150`, bấm Lưu review | Hiện "Điểm phải nằm trong khoảng 0 - 100.", không gửi | — | ☐ |
| 28 | Nhập điểm hợp lệ, bấm Lưu review | Lịch sử chấm hiện "Điểm AI" và "Điểm sau review" là 2 giá trị RIÊNG; khối "Cần review" biến mất | 7.4, 7.5 | ☐ |
| 29 | Bấm "Chấm bài" lần nữa | Lịch sử có 2 lượt, lượt cũ vẫn còn, lượt mới có nhãn "Mới nhất" | 6.6 | ☐ |
| 30 | Bấm "Mở khoá nộp lại" | Trạng thái nhóm thành "Được nộp lại", nút mở khoá biến mất | 8.1 | ☐ |
| 31 | Về app Submitter, mở form nộp bài của đợt đó | Mô tả ô "Tên nhóm" có hướng dẫn: nhóm đã được mở khoá thì nhập đúng tên nhóm cũ | 2.14 | ☐ |
| 32 | Nhập **đúng tên nhóm cũ** + 2 file MỚI rồi nộp | Hiện "Đã nộp lại bài thành công" và câu "thay thế bản nộp trước đó" (KHÔNG phải "Đã nộp bài thành công") | 2.14 | ☐ |
| 33 | Về Admin, vào dashboard nhóm của đợt đó | Vẫn chỉ có **1** nhóm tên đó (không sinh nhóm trùng tên), trạng thái về "Đã nộp" | 3.1 | ☐ |
| 34 | Vào chi tiết nhóm, xem nội dung file | Thấy nội dung file MỚI; lịch sử chấm cũ vẫn còn nguyên | 8.3, 6.6 | ☐ |
| 35 | Thử nộp lần nữa với cùng tên (chưa mở khoá lại) | Bị chặn: "Nhóm ... đã nộp bài, vui lòng liên hệ Admin nếu cần nộp lại." | 2.12 | ☐ |
| 36 | Vào trang "Cấu hình rubric" | Thấy tiêu chí của phiên bản đang dùng; mô tả nói rõ lưu sẽ tạo phiên bản mới | 9.1 | ☐ |
| 37 | Sửa 1 tiêu chí, bấm "Lưu phiên bản mới" | Hiện số phiên bản mới; danh sách phiên bản có cả bản cũ, chỉ bản mới có nhãn "Đang dùng" | 9.2, 9.4 | ☐ |
| 38 | Đổi trọng số cho tổng khác 100 | Hiện cảnh báo về tổng trọng số nhưng VẪN lưu được | — | ☐ |
| 39 | Về trang "Đợt chấm", bấm "Xuất Excel" | File `.xlsx` được tải xuống, tên dạng `diem-dot-kiem-thu-<ngày>.xlsx` | 10.1, 10.4 | ☐ |
| 40 | Mở file Excel vừa tải | Có 6 cột; mỗi thành viên 1 dòng; nhóm đã chấm có điểm dạng SỐ; nhóm chưa chấm ghi rõ `CHƯA CHẤM` | 10.2, 10.3 | ☐ |
| 41 | Đăng xuất từ menu tài khoản | Về trang đăng nhập; gõ tay URL `/assignments` vẫn bị chặn | 4.1 | ☐ |

## Ghi chú: cách nhóm nộp lại (bước 31-35)

Submitter nộp lại bằng cách **nhập lại đúng tên nhóm cũ** ở form nộp bài, chứ
không có trang riêng. Lý do: Submitter chỉ biết tên nhóm, còn endpoint
`resubmitTeamFiles` cần `teamId` — mà cách duy nhất để tra `teamId` theo tên là
`listTeams(assignmentId)`, hàm này trả về cả email thành viên của mọi nhóm nên
để khu vực public gọi là vi phạm Requirement 11.1.

Vì vậy `createTeamAndSubmit` lo cả hai việc: tra nhóm theo `assignmentId` + tên
đã chuẩn hoá rồi xử theo trạng thái —

| Trạng thái nhóm trùng tên | Hành vi |
| ------------------------- | ------- |
| Không có nhóm nào | Tạo nhóm mới |
| `OPEN` (đã tạo, chưa từng nộp) | Nộp vào đúng nhóm đó |
| `RESUBMISSION_ALLOWED` | Nộp lại vào đúng nhóm đó |
| `SUBMITTED` | Từ chối, trùng tên |

Thiết kế này cũng đóng một defect: bản trước chỉ chặn khi nhóm trùng tên đang
`SUBMITTED`, nên sau khi Admin mở khoá, nhóm nhập lại tên cũ sẽ **tạo thêm một
nhóm trùng tên** thay vì nộp lại — vi phạm Property 1 trong `design.md`. Xem
`design.md` > "Nộp lại qua `createTeamAndSubmit`" và các test ở
`packages/api-client/test/raceCondition.test.ts`.

## Phần đã được tự động hoá

Không cần kiểm tay lại những điều sau, đã có test tự động:

| Phạm vi | File test | Số test |
| ------- | --------- | ------- |
| Luồng end-to-end ở tầng service | `packages/api-client/test/endToEndFlow.test.ts` | 4 |
| Race condition + Property 1 (gồm cả nộp lại) | `packages/api-client/test/raceCondition.test.ts` | 15 |
| Service layer từng domain | `packages/api-client/test/*.ts` | 68 tổng |
| UI Submitter | `apps/web-submitter/test/` | 90 |
| UI Admin | `apps/web-admin/test/` | 179 |

Việc kiểm tay ở trên tập trung vào thứ test không chạm tới được: giao diện hiển
thị đúng không, điều hướng có mượt không, MSW Service Worker có chặn request
trong trình duyệt thật không, và file `.xlsx` tải về có mở được bằng Excel không.
