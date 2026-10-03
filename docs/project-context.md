# Project Context: Web Chấm Bài Sinh Viên bằng AI (AWS)

> Tài liệu này mô tả bối cảnh, nghiệp vụ, và kiến trúc dữ liệu dự kiến cho dự án. Đây là tài liệu sống — cập nhật khi có thay đổi quyết định.

## 0. Kế hoạch triển khai (phasing)

> ✅ **Đã xác nhận**: dự án được triển khai theo từng giai đoạn, không làm toàn bộ AI/hạ tầng AWS ngay từ đầu.

1. **Giai đoạn 1 (hiện tại)**: xây dựng **UI chạy local** trước (React, cả trang Submitter và trang Admin), để hoàn thiện luồng UX (form nộp bài, dashboard Admin, viewer file, v.v.) mà chưa cần deploy AWS.
2. **Giai đoạn 2**: cấu hình và gọi API thật (S3, DynamoDB, Cognito, API Gateway/Lambda) — thay thế mock bằng API thật.
3. **Giai đoạn 3**: xử lý AI Grader (gọi Amazon Quick/Bedrock để chấm bài) — phần này **làm sau cùng**, vì còn phải spike kỹ thuật để xác định API/endpoint phù hợp (xem mục 1).

> ✅ **Đã xác nhận cách mock ở giai đoạn 1**: dùng **1 lớp mock server nhẹ** (ví dụ MSW — Mock Service Worker, hoặc JSON server) thay vì chỉ giữ data trong React state. Frontend gọi API qua **service layer** (module riêng cho từng domain: `teamsApi`, `submissionsApi`, `gradingApi`, `rubricsApi`...) như thể đang gọi API thật; ở giai đoạn 1, service layer này trỏ vào mock server. Khi chuyển sang giai đoạn 2, chỉ cần đổi base URL / implementation của service layer sang API Gateway thật — không cần viết lại component UI. Đây là lý do nên định nghĩa rõ **API contract (request/response shape)** ngay từ đầu, khớp với mô hình dữ liệu ở mục 5.

## 1. Xác nhận công nghệ AI chấm bài

- **Amazon Quick** = tên gọi mới của **Amazon Q** (AWS đã rebrand, năm 2026), là AI assistant/agent của AWS có giao diện Chat, Feed, Library, Customize, hỗ trợ autonomous agents và kết nối tới nhiều nguồn dữ liệu/ứng dụng doanh nghiệp. **Không phải Amazon QuickSight** (dịch vụ BI/dashboard).
- Trong dự án này, Amazon Quick sẽ đóng vai trò **AI Grader**: nhận nội dung 2 file bài làm của nhóm (`.md`, `.xml`) + rubric, trả về điểm số + nhận xét.
- ✅ **Đã xác nhận Amazon Quick hỗ trợ gọi bằng API** (theo tài liệu [docs.aws.amazon.com/quick](https://docs.aws.amazon.com/quick/)). Qua kiểm tra tài liệu, Amazon Quick cung cấp: Connector APIs (tạo/quản lý kết nối), REST API Connection integration (cho phép Quick gọi ra REST API bên ngoài để thực thi action), và cơ chế agent/chat có thể embed hoặc gọi qua API.
- **Còn cần spike kỹ thuật ở bước design** (chưa chốt được từ tài liệu công khai): xác định chính xác API endpoint nào phù hợp nhất cho use case "gửi nội dung 2 file + rubric → nhận về điểm số dạng có cấu trúc" — ví dụ agent invoke API (tương tự `InvokeAgent` của Bedrock Agents) hay cơ chế khác của Quick. Cần đọc kỹ [API reference của Amazon Quick](https://docs.aws.amazon.com/quick/) hoặc liên hệ AWS support/solutions architect để xác nhận endpoint cụ thể, giới hạn rate/token, và định dạng input/output trước khi implement Lambda gọi AI Grader.
- Phương án dự phòng nếu API của Amazon Quick không đáp ứng đủ nhu cầu batch/structured-output: gọi trực tiếp model nền qua **Amazon Bedrock** (`InvokeModel`), vẫn giữ được rubric-based prompt, nhưng đây chỉ là phương án B nếu A không khả thi.
- ✅ **Đã xác nhận: phần AI Grader được triển khai sau cùng** (xem mục 0 — kế hoạch triển khai). Ở giai đoạn hiện tại, chỉ cần thiết kế API contract (input/output shape) cho việc gọi AI Grader — chưa cần implement thật; có thể dùng mock response để phát triển UI/luồng chấm trước.

## 2. Tổng quan dự án

Xây dựng một web app cho phép:

- Người dùng (User — thường là giảng viên/trợ giảng, hoặc đại diện nhóm) **nộp bài thay cho nhóm sinh viên**.
- Mỗi nhóm gồm nhiều thành viên (chỉ để biết ai thuộc nhóm nào); **cả nhóm nộp chung 1 bộ 2 file** (`.md` và `.xml`) — không phải mỗi thành viên nộp riêng.
- Hệ thống **chấm bài bằng AI theo yêu cầu Admin** dựa trên benchmark/rubric do người quản trị cung cấp.
- Hệ thống lưu vết đầy đủ: ai nộp, nộp lúc nào, bài nào đã được chấm, chấm lúc nào, điểm bao nhiêu, có cần review thủ công không — và **chống chấm trùng lặp** (idempotency).

## 3. Đối tượng sử dụng (Actors)

| Actor | Vai trò | Auth |
|---|---|---|
| **Submitter** (User nộp bài) | Đại diện nhóm, khai báo tên nhóm + danh sách thành viên, upload **1 bộ 2 file chung cho cả nhóm** | **Không cần đăng nhập** — ai có link cũng nộp được |
| **Admin** (bao gồm vai trò Reviewer/Giảng viên) | Xem điểm/kết quả chấm (chỉ Admin mới xem được điểm), review bài `needsReview`, chấm on-demand, cấu hình rubric, mở khoá cho nhóm nộp lại | **Bắt buộc đăng nhập qua Amazon Cognito** |
| **AI Grader (Amazon Quick / Bedrock)** | Đọc 2 file `.md` + `.xml` chung của nhóm, chấm điểm theo rubric, trả về điểm số + giải thích | Service-to-service (IAM role), không phải actor người dùng |

> Lưu ý: dự án không có vai trò "Reviewer" tách riêng khỏi Admin — mọi việc xem điểm/review đều nằm trong khu vực Admin, được bảo vệ bởi Cognito.

## 4. Luồng nghiệp vụ chính

### 4.0. Khái niệm "Assignment" / Đợt chấm

> ✅ **Đã xác nhận (bổ sung mới)**: thêm khái niệm **Assignment (Đợt chấm)** để giải quyết vấn đề chống trùng tên nhóm bị áp dụng sai phạm vi (ví dụ 2 kỳ học khác nhau đều có "Nhóm 1" nhưng bị chặn nhầm vì hệ thống coi là trùng toàn cục).

- **Admin tạo Assignment trước** khi mở cho Submitter nộp bài. Mỗi Assignment gồm:
  - `assignmentId` (PK, UUID)
  - `assignmentName` — tên đợt chấm (ví dụ "Bài tập lớn Kỳ 1 - Lớp CNTT1")
  - `status` — `OPEN` (đang mở cho nộp bài) \| `CLOSED` (đã đóng, không cho nộp mới)
  - `createdAt`, `createdBy` (Admin nào tạo)
- **Submitter khi vào trang nộp bài phải chọn đúng 1 Assignment đang `OPEN`** (ví dụ qua link riêng biệt theo assignment, hoặc dropdown chọn đợt) trước khi điền form nhóm.
- **Chống trùng tên nhóm chỉ áp dụng trong phạm vi 1 Assignment**, không áp dụng toàn hệ thống — tức là khoá chống trùng (`teamNameNormalized`) giờ là **composite** theo `assignmentId + teamNameNormalized`, không phải chỉ `teamNameNormalized` như thiết kế cũ (xem lại bảng `Teams` ở mục 5 — đã cập nhật).
- Khi Assignment chuyển `CLOSED`, Submitter không thể tạo nhóm mới hoặc nộp bài vào đợt đó nữa (nhưng Admin vẫn xem/chấm được các nhóm đã nộp).
- Trang Admin có thêm chức năng: **tạo Assignment mới, đóng/mở Assignment, xem danh sách nhóm theo từng Assignment** (dashboard lọc theo đợt).

> Lưu ý: đây chỉ là khái niệm quản lý, không phải "deadline" — Assignment không tự đóng theo thời gian (đã xác nhận không có deadline), Admin phải chủ động đóng bằng tay nếu muốn.

> ✅ **Đã xác nhận: mỗi Assignment tạo nhóm hoàn toàn độc lập** — không có khái niệm "1 nhóm sinh viên xuyên suốt nhiều đợt". Nếu cùng 1 nhóm sinh viên nộp bài ở 2 Assignment khác nhau, hệ thống coi đó là **2 `teamId` riêng biệt, không liên kết với nhau** (dù tên nhóm/thành viên giống nhau). Điều này phù hợp với việc chống trùng tên chỉ scope theo Assignment (không cần lo trường hợp "nhóm cũ" ảnh hưởng "nhóm mới" giữa các đợt).

### 4.1. Luồng nộp bài

> ✅ **Đã xác nhận (sửa lại)**: mỗi **nhóm chỉ nộp chung 1 bộ 2 file** (`.md` và `.xml`), **không phải mỗi thành viên nộp riêng**. Danh sách thành viên chỉ dùng để biết ai thuộc nhóm nào (thông tin liên hệ/định danh), không gắn file riêng theo từng người.

**UI form nộp bài (Submitter, không đăng nhập) — chỉ gồm:**

- **Chọn Assignment (đợt chấm)** — Submitter phải ở đúng 1 Assignment đang `OPEN` (xem mục 4.0) trước khi điền các field dưới đây.
- **Tên nhóm** (1 field text).
- **Danh sách thành viên trong nhóm** — có nút **"+ Thêm sinh viên"** để Submitter tự thêm/xoá số lượng thành viên (dynamic list). Mỗi thành viên gồm:
  - **Tên sinh viên**
  - **Email**
  - **MSSV (mã số sinh viên)** — *tùy chọn* (không bắt buộc, vì có thể không phải mọi nhóm đều có MSSV lúc nộp)
- **Upload 2 file bài làm chung cho cả nhóm**: 1 file `.md` và 1 file `.xml` (không upload theo từng thành viên).

> Đã bỏ field "Tên trường" khỏi form nộp bài theo yêu cầu mới — nếu cần thông tin trường, sẽ do Admin quản lý riêng (ví dụ gắn trường theo đợt chấm bài/kỳ học ở trang Admin) chứ không thu thập từ Submitter.

Luồng xử lý:

1. Submitter (**không cần đăng nhập**) khai báo **tên nhóm** và **danh sách thành viên** (tên, email, MSSV nếu có).
2. Submitter upload **2 file chung của nhóm**: `.md` và `.xml`.
3. Hệ thống lưu file lên **S3**, ghi nhận record nộp bài vào **DynamoDB**:
   - Nhóm nào nộp (teamId)
   - Nộp lúc nào (timestamp)
   - File nào, đường dẫn S3 nào, phiên bản nào (S3 version/ETag để phát hiện file có bị thay đổi/nộp lại không)
4. ✅ **Xác nhận UX phản hồi khi nộp bài**: sau khi toàn bộ dữ liệu (thông tin nhóm/thành viên + 2 file) được ghi nhận thành công vào DynamoDB, hệ thống hiển thị **thông báo "Đã nộp bài thành công"** cho Submitter ngay trên trang web. Nếu ghi DynamoDB thất bại (lỗi hệ thống, mất kết nối...), hiển thị thông báo lỗi rõ ràng để Submitter biết cần thử lại — **không dùng email để thông báo**, chỉ dùng thông báo tức thời (in-app notification) dựa trên kết quả API response.

**Chính sách chống nộp trùng / nộp lại (quan trọng):**

- Khi Submitter tạo nhóm, hệ thống kiểm tra **tên nhóm đã tồn tại chưa** (so khớp theo `teamName`, cần chuẩn hoá — ví dụ lowercase + trim — để tránh trùng do khác hoa/thường hoặc khoảng trắng).
- Nếu **tên nhóm đã tồn tại và ở trạng thái đã nộp (`LOCKED`/`SUBMITTED`)** → **chặn nộp**, trả lỗi rõ ràng cho Submitter (ví dụ: "Nhóm '<tên>' đã nộp bài. Vui lòng liên hệ Admin nếu cần nộp lại.").
- Nhóm chỉ được nộp lại khi **Admin chủ động mở khoá** (đổi trạng thái nhóm về `RESUBMISSION_ALLOWED` hoặc tương đương) — đây là hành động **thủ công, chỉ Admin thực hiện được qua trang Admin** (đã đăng nhập Cognito).
- Vì Submitter không đăng nhập, **việc "sở hữu" 1 nhóm được xác định hoàn toàn qua tên nhóm** (không có cơ chế xác thực chủ nhóm) — cần lưu ý rủi ro: bất kỳ ai biết/đoán được tên nhóm khác đều có thể xem là "trùng tên" và bị chặn nộp, nhưng **không thể mạo danh nộp thay** vì hệ thống chặn hoàn toàn khi đã `SUBMITTED` (không đè được bài của nhóm khác). Cần thêm rate-limiting/CAPTCHA ở tầng API để tránh spam tạo nhóm ảo (xem mục bảo mật).
- Trạng thái nhóm đề xuất: `OPEN` (chưa nộp) → `SUBMITTED` (đã nộp đủ, khoá) → `RESUBMISSION_ALLOWED` (Admin mở khoá) → `SUBMITTED` (nộp lại) ...

### 4.2. Luồng chấm bài bằng AI

> ✅ **Đã xác nhận**: việc chấm bài **hoàn toàn do Admin quyết định** — không có auto-trigger chấm ngay khi nộp đủ file. Admin chọn nhóm nào để chấm, và lúc nào chấm. Điều này đơn giản hoá luồng: **không cần S3 Event/EventBridge trigger tự động cho việc chấm** — chỉ cần 1 con đường duy nhất là API on-demand do Admin gọi (xem mục 4.4).
>
> ✅ **Đã xác nhận (sửa lại): đơn vị chấm là cả NHÓM, và mỗi nhóm chỉ có đúng 1 bộ 2 file** (`.md` + `.xml`) — không có khái niệm "chấm từng thành viên" hay "tổng hợp điểm nhiều thành viên", vì bản thân bài nộp đã là 1 bài chung của cả nhóm. Admin trigger chấm theo `teamId`, AI Grader chấm 1 lần trên 2 file đó và trả về **1 điểm duy nhất cho cả nhóm**.

1. Khi nhóm đã nộp đủ **2 file chung** (`.md` + `.xml`), nhóm chuyển trạng thái sẵn sàng để chấm (`READY_TO_GRADE`), nhưng **không tự chấm** — chờ Admin chủ động trigger theo nhóm.
2. Khi Admin trigger chấm 1 nhóm, AI Grader nhận:
   - Nội dung 2 file chung của nhóm (`.md`, `.xml`)
   - **Benchmark/rubric** (tiêu chí chấm điểm do Admin cấu hình)
3. AI trả về:
   - **Điểm số tổng** (1 số duy nhất, gắn cho cả nhóm — đã xác nhận)
   - Giải thích/nhận xét
   - Cờ đề xuất **cần review thủ công** (`needsReview`) — ví dụ khi AI không chắc chắn, điểm ở biên, hoặc file không đúng format
4. Kết quả được ghi vào DynamoDB, gắn với `teamId` + `gradingAttemptId` (1 lượt chấm = 1 lần Admin bấm nút chấm cho 1 nhóm) kèm timestamp chấm.
5. **Chống chấm trùng lặp**: trước khi chấm 1 nhóm, kiểm tra xem nhóm này đã có lượt chấm ở trạng thái `IN_PROGRESS` chưa — dùng **conditional write** của DynamoDB (`attribute_not_exists`) để đảm bảo chỉ 1 lượt chấm chạy cho 1 nhóm tại 1 thời điểm, tránh Admin double-click hoặc trigger trùng.
6. ✅ **Đã xác nhận: giữ lại toàn bộ lịch sử các lượt chấm cũ** — khi nhóm được Admin mở khoá và nộp lại (bộ 2 file mới), lượt chấm mới sẽ tạo thêm 1 bản ghi mới (`gradingAttemptId` mới), **không xoá/đè** kết quả chấm cũ, để Admin có thể xem lại và so sánh giữa các lượt.

### 4.3. Luồng review thủ công (khi cần)

> Toàn bộ luồng này nằm trong trang Admin (đã đăng nhập Cognito) — **Submitter không bao giờ thấy điểm hoặc feedback**.

1. Admin xem danh sách bài có `needsReview = true`.
2. Admin xem lại nội dung bài + kết quả AI chấm.
3. Admin có thể: chấp nhận điểm AI, hoặc sửa điểm + ghi lý do.
4. Trạng thái review được lưu lại (Admin nào review, lúc nào, điểm cuối cùng).

### 4.4. Trang Admin (khu vực quản trị riêng)

Web app có **2 khu vực tách biệt**:

- **Trang nộp bài** (Submitter) — mô tả ở mục 4.1.
- **Trang Admin** (Giảng viên/Admin) — dùng để quản lý và chấm bài, gồm các chức năng:
  - **Danh sách nhóm nộp bài**, lọc/phân loại theo trạng thái: **chưa chấm** / **đã chấm** (và các trạng thái khác như `needsReview`, `FAILED`).
  - Admin **chọn 1 nhóm** để **trigger chấm bài** — chấm **on-demand**, hoàn toàn do Admin chủ động chọn.
  - Admin **xem trực tiếp nội dung 2 file bài làm chung của nhóm** (`.md` và `.xml`) ngay trên web, không cần tải file về.
  - Admin xem **kết quả chấm của nhóm** (điểm, nhận xét) song song với nội dung 2 file, để dễ đối chiếu khi review. Admin cũng xem được **lịch sử tất cả các lượt chấm cũ của nhóm** (nếu nhóm đã được mở khoá và nộp lại nhiều lần).
  - Admin cấu hình **rubric/tiêu chí chấm điểm** qua UI (xem mục 6).
  - (Tương lai) Admin cấu hình tiêu chí để AI tự đánh dấu `needsReview`.
  - ✅ **Xuất điểm ra file Excel** (đã xác nhận) — Admin chọn 1 Assignment (đợt chấm), bấm "Xuất Excel", hệ thống xuất ra file `.xlsx` liệt kê **theo từng nhóm**, gồm các cột: tên nhóm, **tên thành viên + MSSV của từng thành viên** (đã xác nhận thêm MSSV), điểm (`finalScore` nếu có review, ngược lại `score` từ AI), trạng thái review, thời điểm chấm. Đây là tính năng chính thức trong scope, không phải "nice to have" — vì Admin cần đưa điểm này vào hệ thống của trường (bảng điểm/LMS).
    - Cấu trúc gợi ý: 1 dòng = 1 nhóm, với các thành viên liệt kê trong 1 cột (ví dụ `"Nguyễn Văn A (MSSV001); Trần Thị B (MSSV002)"`) hoặc mỗi thành viên 1 dòng con lặp lại điểm của nhóm — chi tiết cách trình bày (1 dòng/nhóm vs 1 dòng/thành viên) sẽ chốt ở bước design tuỳ theo cách trường yêu cầu nhập điểm.

> Lưu ý kỹ thuật: vì **chấm bài chỉ chạy on-demand do Admin quyết định** (không có trigger tự động), hệ thống chỉ cần **1 API chấm theo yêu cầu** (Admin bấm nút "Chấm bài" trên UI → gọi API → Lambda chấm), nhưng vẫn cần cơ chế idempotency/conditional write để tránh Admin bấm 2 lần liên tiếp (double-click) gây chấm trùng cùng 1 bài.

## 5. Mô hình dữ liệu (DynamoDB) — đề xuất sơ bộ

> Đây là thiết kế khái niệm, sẽ tinh chỉnh khi vào giai đoạn design chi tiết (single-table vs multi-table).

### Bảng `Assignments`

| Field | Type | Ghi chú |
|---|---|---|
| `assignmentId` (PK) | String | UUID, sinh ra khi Admin tạo đợt chấm |
| `assignmentName` | String | Tên đợt chấm (ví dụ "Bài tập lớn Kỳ 1 - Lớp CNTT1") |
| `status` | String | `OPEN` \| `CLOSED` |
| `createdAt` | String (ISO8601) | |
| `createdBy` | String | Admin nào tạo |

### Bảng `Teams`
| Field | Type | Ghi chú |
|---|---|---|
| `teamId` (PK) | String | ID nội bộ (UUID), sinh ra khi tạo nhóm |
| `assignmentId` | String | Đợt chấm mà nhóm này thuộc về — **bắt buộc**, dùng để scope chống trùng tên nhóm theo đợt |
| `assignmentId#teamNameNormalized` | String | **Dùng làm khoá chống trùng** — composite của `assignmentId` + `teamName` đã chuẩn hoá (lowercase, trim, bỏ khoảng trắng dư) — cần **GSI (Global Secondary Index)** trên field này để tra cứu trùng tên nhanh (O(1) lookup thay vì scan), **và chỉ coi là trùng nếu cùng `assignmentId`** |
| `teamName` | String | Tên nhóm hiển thị (giữ nguyên bản gốc do Submitter nhập) |
| `members` | List<Map> | `{ memberId, memberName, email, studentCode? }` — số lượng thành viên động, Submitter tự thêm/xoá; `studentCode` là **tuỳ chọn**, `email` bắt buộc |
| `status` | String | `OPEN` \| `SUBMITTED` \| `RESUBMISSION_ALLOWED` |
| `createdAt` | String (ISO8601) | |
| `createdBy` | String | Thông tin định danh nhẹ của Submitter (nếu có, ví dụ email liên hệ nhóm nhập tay — không phải tài khoản đăng nhập) |
| `unlockedBy` / `unlockedAt` | String | Admin nào mở khoá resubmit, lúc nào (audit trail) |

> Quyết định kỹ thuật: việc chống trùng tên nhóm **phải là write có điều kiện**, và **scope theo `assignmentId`** (DynamoDB `ConditionExpression: attribute_not_exists(...)` trên khoá composite `assignmentId#teamNameNormalized`, hoặc dùng chính khoá này làm PK của 1 bảng lookup riêng) để tránh race condition khi 2 người tạo nhóm cùng tên đồng thời trong cùng 1 đợt.

### Bảng `Submissions`

> ✅ Mỗi nhóm chỉ có **1 bộ 2 file chung** — không gắn theo `memberId`, chỉ gắn theo `teamId`.

| Field | Type | Ghi chú |
|---|---|---|
| `teamId` (PK) | String | |
| `submittedAt#fileType` (SK) | String | Cho phép giữ lịch sử nhiều lần nộp (mỗi lần nộp lại tạo bản ghi mới, không đè) |
| `fileType` | String | `md` \| `xml` |
| `s3Key` | String | |
| `s3VersionId` / `etag` | String | Dùng để phát hiện thay đổi nội dung, tránh chấm lại file giống cũ |
| `submittedAt` | String (ISO8601) | |
| `isLatest` | Boolean | Đánh dấu lần nộp mới nhất được dùng để chấm |

### Bảng `GradingResults`

> ✅ Đơn vị chấm là **nhóm**, và mỗi nhóm chỉ có 1 bộ 2 file — nên AI chấm 1 lần, trả về 1 điểm duy nhất cho cả nhóm (không có `memberResults`). 1 lượt chấm (`gradingAttemptId`) = 1 lần Admin trigger chấm cho 1 `teamId`.

| Field | Type | Ghi chú |
|---|---|---|
| `teamId` (PK) | String | Nhóm được chấm |
| `gradingAttemptId` (SK) | String | Định danh 1 lượt chấm — tăng dần theo thời gian, hỗ trợ **giữ lại toàn bộ lịch sử các lượt chấm cũ** (đã xác nhận không xoá/đè) |
| `status` | String | `PENDING` \| `IN_PROGRESS` \| `GRADED` \| `FAILED` |
| `score` | Number | **Điểm tổng của nhóm** (1 số duy nhất do AI trả về) |
| `aiFeedback` | String | Giải thích/nhận xét của AI |
| `gradedAt` | String (ISO8601) | Thời điểm hoàn tất lượt chấm |
| `gradedBy` | String | `AI` hoặc `ADMIN` (nếu Admin chấm tay/sửa lại sau) |
| `needsReview` | Boolean | Cờ do AI đề xuất; tiêu chí cụ thể Admin bổ sung sau |
| `reviewStatus` | String | `NOT_REQUIRED` \| `PENDING_REVIEW` \| `REVIEWED` |
| `reviewedBy` | String | |
| `finalScore` | Number | Điểm sau review (nếu Admin sửa lại) |
| `rubricVersion` | Number | Để biết lượt chấm này dùng phiên bản rubric nào (số tăng dần, khớp `Rubrics.version`) |
| `idempotencyKey` | String | Hash(teamId + s3ETag_md + s3ETag_xml) — dùng conditional write chống chấm trùng cho cùng 1 nhóm |
| `triggeredBy` | String | Admin nào bấm nút chấm |

### Bảng `Rubrics` (cấu hình bởi Admin qua UI)
| Field | Type | Ghi chú |
|---|---|---|
| `rubricId` (PK) | String | |
| `version` (SK) | Number | Tăng dần mỗi khi Admin sửa rubric |
| `criteria` | List<Map> | Danh sách tiêu chí chấm, do Admin nhập qua UI — cấu trúc chi tiết sẽ chốt khi có UI cấu hình |
| `reviewFlagRules` | List<Map> / JSON | Tiêu chí để AI tự đánh dấu `needsReview` — Admin bổ sung sau |
| `isActive` | Boolean | Rubric đang được áp dụng |
| `createdAt` / `updatedAt` | String (ISO8601) | |

## 6. Tiêu chí chấm điểm (Benchmark/Rubric)

- Admin cung cấp rubric (tiêu chí + thang điểm):
  - ✅ **Đã chốt: thang điểm 0-100** (giai đoạn 1). Khai báo tại `packages/shared-types/src/gradingScale.ts` (`GRADING_SCALE`) — là **nguồn duy nhất** cho ô nhập điểm khi Admin review, ngưỡng `needsReview`, và khoảng điểm mà mock AI Grader sinh ra. Chọn 0-100 vì quy đổi về thang 10 của trường chỉ là chia 10 (không mất độ chính xác), chiều ngược lại thì mất. Muốn đổi thang: sửa đúng `GRADING_SCALE.max`.
  - ✅ **Trọng số tiêu chí là phần trăm, thang 0-100, tổng mong đợi 100%** (`RUBRIC_WEIGHT_PERCENT`). Đây là thang **độc lập** với thang điểm — đổi thang điểm sang 0-10 thì trọng số vẫn là 0-100%. Tổng lệch 100% chỉ cảnh báo, không chặn lưu (vì `weight` là field tuỳ chọn).
  - ✅ **Đã chốt: rubric lưu ở DynamoDB** (bảng `Rubrics`, xem mục 5), **có versioning** — mỗi lần Admin lưu thì tăng `version` và giữ nguyên các bản cũ, để tra được lượt chấm cũ đã dùng rubric nào.
  - ⏳ `reviewFlagRules` (tiêu chí để AI tự đánh dấu `needsReview`) **để trống có chủ ý** tới Giai đoạn 3: cờ này do AI Grader sinh ra, nên thiết kế UI cấu hình trước khi biết output shape thật của Amazon Quick sẽ gần như chắc chắn sai hình dạng. Giai đoạn 1 dùng quy tắc stub `score < 70% thang điểm` (`NEEDS_REVIEW_THRESHOLD_RATIO`).
  - AI chấm dựa trên **nội dung file `.md`** (thường là báo cáo/giải thích) và **file `.xml`** (thường là cấu hình/kết quả kỹ thuật) của **cả nhóm** (1 bộ file chung, không phải theo từng thành viên) — cần định nghĩa rõ vai trò của từng file trong tiêu chí chấm.

## 7. Kiến trúc kỹ thuật dự kiến (AWS)

- **Frontend**: ✅ **React** (đã xác nhận), gồm 2 khu vực (2 SPA riêng hoặc 1 app với routing tách rõ):
  - Trang nộp bài (public, không auth) — form: tên nhóm + danh sách thành viên (tên, email, MSSV tuỳ chọn) dạng dynamic list, upload **2 file chung của nhóm** (`.md` + `.xml`).
  - Trang Admin (Cognito protected) — dashboard danh sách nhóm (chưa chấm/đã chấm), nút chấm on-demand theo nhóm, **viewer xem trực tiếp nội dung 2 file `.md` và `.xml` của nhóm** (render markdown, hiển thị XML dạng có format/syntax highlight), form cấu hình rubric.
  - UI theo Cloudscape Design System (xem mục 8.3).
- **API layer**: API Gateway + Lambda.
- **Storage file**: Amazon S3 (bucket cho bài nộp, versioning enabled để hỗ trợ resubmit + phát hiện thay đổi). Admin xem file trực tiếp trên web → cần API lấy nội dung file (hoặc presigned URL) từ S3 để hiển thị, không expose bucket public.
- **Database**: Amazon DynamoDB (bảng `Teams`, `Submissions`, `GradingResults`, `Rubrics` — xem mục 5, có thể tinh chỉnh thành single-table design ở bước design).
- **AI Grading**: Amazon Quick — gọi qua API của Amazon Quick (xem mục 1, đã xác nhận Quick hỗ trợ gọi API; endpoint cụ thể cần spike kỹ thuật ở bước design). Lambda đọc file từ S3, gọi AI Grader với prompt/context chứa rubric (từ bảng `Rubrics`) + nội dung 2 file, nhận kết quả, ghi vào DynamoDB.
- **Trigger chấm bài**: ✅ **Chỉ 1 cơ chế — on-demand theo nhóm, hoàn toàn do Admin quyết định** (đã xác nhận, không có auto-trigger). Admin chọn 1 nhóm trên UI → gọi API → Lambda chấm nhóm đó. Vẫn cần idempotency (DynamoDB conditional write) để tránh double-click gây chấm trùng cùng 1 nhóm trong 1 lần bấm.
- **Xử lý lỗi khi chấm bài**: ✅ **Dùng Amazon SQS** (đã xác nhận) — khi Admin trigger chấm (1 nhóm hoặc nhiều nhóm), request được đưa vào SQS queue, Lambda worker xử lý (poll queue, gọi AI Grader). Nếu Lambda lỗi hoặc AI Grader trả lỗi/timeout, message được retry theo redrive policy; sau số lần retry tối đa, message chuyển vào **Dead Letter Queue (DLQ)** và lượt chấm được đánh dấu `FAILED` trong DynamoDB để Admin thấy và có thể trigger chấm lại. Cách dùng SQS cụ thể (standard vs FIFO, số lần retry, visibility timeout) sẽ chốt ở bước design.
- **Xuất báo cáo**: API/Lambda riêng để **xuất điểm ra Excel theo Assignment** (đã xác nhận) — đọc dữ liệu từ `Teams` + `GradingResults` theo `assignmentId`, dùng thư viện tạo file `.xlsx` (ví dụ `exceljs` cho Node.js), trả về qua presigned URL hoặc stream trực tiếp cho Admin tải xuống.
- **Auth**: 
  - Submitter: **không đăng nhập** — trang nộp bài là public, chỉ nộp lên S3/DynamoDB qua API công khai (có rate-limit/CAPTCHA để chống spam/bot).
  - Admin: **bắt buộc Amazon Cognito User Pool** — API Gateway dùng Cognito Authorizer để bảo vệ toàn bộ endpoint thuộc trang Admin (danh sách bài, xem điểm, xem nội dung file, trigger chấm, mở khoá resubmit, cấu hình rubric).
  - ✅ **Đã xác nhận: tắt self-signup cho Cognito User Pool của Admin** — không cho phép người ngoài tự đăng ký làm Admin. Tài khoản Admin chỉ được tạo tay bởi người vận hành hệ thống (qua AWS CLI/Console/CDK, hoặc 1 script `AdminCreateUser`), theo mô hình invite-only.

## 8. Yêu cầu phi chức năng

### 8.1. Bảo mật

Vì trang nộp bài **public, không cần đăng nhập**, đây là bề mặt tấn công chính cần đặc biệt lưu ý:

- **Phân quyền rõ ràng theo 2 vùng:**
  - Vùng public (nộp bài): chỉ được phép **CREATE** (tạo nhóm mới, upload file) — tuyệt đối không có quyền đọc điểm, đọc danh sách nhóm khác, đọc nội dung bài của nhóm khác.
  - Vùng Admin: mọi API đều qua **Cognito Authorizer**, kiểm tra `Admin` group/role trong token trước khi cho phép truy cập.
- **Chống spam/bot ở API nộp bài:**
  - Rate limiting theo IP tại API Gateway (usage plan/throttling).
  - CAPTCHA (ví dụ AWS WAF CAPTCHA hoặc Google reCAPTCHA) trước khi submit form tạo nhóm.
  - AWS WAF gắn trước API Gateway/CloudFront để chống common exploits (SQLi/XSS patterns dù backend là DynamoDB, chống volumetric abuse).
- **Upload file an toàn:**
  - Dùng **S3 Presigned URL** cho việc upload (client upload trực tiếp lên S3, không qua Lambda) để giảm tải và tránh Lambda phải xử lý payload lớn.
  - ✅ **Giới hạn đã xác nhận**: tối đa **2 file** (đúng 1 file `.md` + 1 file `.xml`), mỗi file tối đa **5MB**. Validate ở cả client (chặn chọn file sai loại/quá lớn trước khi upload) và server (kiểm tra extension + content-type + magic bytes nếu cần, tránh upload file giả mạo đuôi; giới hạn kích thước trong policy của presigned URL — `Content-Length-Range` trên S3 POST policy).
  - Bucket S3 **không public**, chặn toàn bộ Public Access, chỉ truy cập qua presigned URL (upload) hoặc qua Lambda có IAM role (đọc để chấm/hiển thị cho Admin).
  - **Server-side encryption** (SSE-S3 hoặc SSE-KMS) cho bucket.
- **Bảo vệ dữ liệu:**
  - DynamoDB: **encryption at rest** (mặc định có), xem xét thêm field-level nếu có dữ liệu nhạy cảm.
  - Không log nội dung bài làm/điểm số ra CloudWatch Logs ở mức không cần thiết (tránh lộ dữ liệu qua log).
  - IAM roles theo nguyên tắc **least privilege** cho từng Lambda (Lambda nộp bài chỉ có quyền write S3/DynamoDB liên quan, Lambda chấm bài mới có quyền gọi AI + đọc S3).
- **Chống trùng lặp / race condition:**
  - Chặn trùng tên nhóm bằng **conditional write** DynamoDB (mục 5), không check-rồi-write (dễ race condition).
  - Chống chấm trùng bằng idempotency key + conditional write (đã mô tả ở 4.2).
- **Input validation & injection:** validate mọi input từ Submitter (tên nhóm, tên thành viên, email, mã số SV) — chặn ký tự đặc biệt bất thường, giới hạn độ dài, validate format email, escape khi hiển thị trên trang Admin (chống XSS khi Admin xem lại dữ liệu Submitter nhập).
- **CORS**: cấu hình chặt cho API Gateway, chỉ cho phép domain frontend chính thức.

### 8.2. Kiến trúc code / cấu trúc dự án (dễ sửa lỗi, dễ mở rộng, tối ưu hiệu năng)

- **Nguyên tắc chung:**
  - Tách rõ 3 layer: **Presentation** (React components/pages) → **Application/API** (Lambda handlers, tách theo use case) → **Domain/Service** (business logic: kiểm tra trùng tên, tính idempotency key, gọi AI...) → **Data access** (repository pattern bọc DynamoDB/S3 SDK calls).
  - ✅ **Đã xác nhận dùng AWS CDK** để định nghĩa toàn bộ tài nguyên AWS (S3, DynamoDB, Cognito, API Gateway, Lambda...) — dễ review, dễ tái tạo môi trường (dev/staging/prod), tránh cấu hình tay qua console (khó audit, dễ sai). Khuyến nghị dùng **CDK TypeScript** để đồng bộ ngôn ngữ với frontend React và Lambda (nếu Lambda cũng viết Node.js/TypeScript).
  - Monorepo gợi ý cấu trúc:
    ```
    /apps
      /web-submitter    (frontend trang nộp bài - public)
      /web-admin        (frontend trang Admin - Cognito protected)
    /services
      /api              (Lambda handlers theo domain: teams, submissions, grading, rubrics)
    /packages
      /shared-types     (type definitions dùng chung FE/BE)
      /infra (CDK)       (định nghĩa stack: S3, DynamoDB, Cognito, API Gateway, Lambda)
    ```
  - Mỗi Lambda **nhỏ, đơn nhiệm** (single responsibility) — dễ debug, dễ scale riêng lẻ, giảm cold start so với 1 Lambda khổng lồ xử lý mọi route.
- **Tối ưu hiệu năng:**
  - Presigned URL cho upload/download file → giảm tải Lambda, tận dụng băng thông trực tiếp S3.
  - DynamoDB: thiết kế partition key tránh hot partition (ví dụ không dùng `status` làm PK vì ít giá trị, dễ tập trung traffic); dùng GSI cho các truy vấn lọc phổ biến (theo trạng thái chấm, theo nhóm).
  - Cache rubric đang active (ít thay đổi) ở tầng Lambda (in-memory theo execution context) để giảm số lần đọc DynamoDB khi chấm nhiều bài liên tiếp.
  - Batch/song song hoá việc chấm nhiều bài khi Admin trigger theo cả nhóm (tránh chấm tuần tự chậm) — có thể dùng Step Functions Map state hoặc SQS + Lambda concurrency nếu số lượng bài lớn.
- **Dễ sửa lỗi/observability:**
  - Structured logging (JSON logs) trong mọi Lambda, có `requestId`/`teamId`/`submissionId` để trace xuyên suốt.
  - CloudWatch Alarms cho lỗi Lambda, DLQ (Dead Letter Queue) cho các job chấm bài thất bại để không mất job.
  - Health-check / status endpoint riêng cho việc giám sát.

### 8.3. Giao diện (UI) — chủ đề AWS Cloud

- Theme lấy cảm hứng từ **AWS Console / Cloudscape Design System** (thư viện UI chính thức của AWS, đã có sẵn component React): 
  - Màu chủ đạo: xanh navy đậm (AWS Squid Ink `#232F3E`), cam AWS (`#FF9900`) làm accent, nền sáng/tối theo chuẩn Cloudscape.
  - Font, spacing, icon theo phong cách console AWS (gọn, rõ, nhiều bảng dữ liệu/status badge).
  - Trang Admin nên giống dashboard AWS Console: sidebar điều hướng, bảng danh sách có filter/sort/pagination, badge trạng thái màu (xanh = GRADED, vàng = PENDING/needsReview, đỏ = FAILED).
  - Trang nộp bài (Submitter) đơn giản, thân thiện hơn (vẫn theo bảng màu AWS) vì đối tượng dùng là sinh viên, không cần phức tạp như console.
  - Khuyến nghị dùng thư viện **[Cloudscape Design System](https://cloudscape.design/)** (open-source, do AWS phát triển) để có sẵn component đúng chất AWS Cloud, thay vì tự vẽ theme từ đầu.

### 8.4. Các yêu cầu phi chức năng khác

- **Chống trùng lặp chấm điểm**: bắt buộc, dùng DynamoDB conditional write + idempotency key.
- **Audit trail**: lưu đầy đủ lịch sử nộp bài và lịch sử chấm (không xoá, chỉ đánh dấu `isLatest`), kèm audit log các hành động Admin (mở khoá resubmit, sửa điểm).
- **Khả năng mở rộng**: số lượng nhóm/thành viên có thể tăng theo kỳ học — thiết kế partition key tránh hot partition, Lambda scale tự động theo tải.
- ✅ **Data retention**: đã xác nhận **giữ lại toàn bộ dữ liệu vô thời hạn** (không có cơ chế tự xoá theo thời gian), **chấp nhận chi phí lưu trữ S3/DynamoDB tăng dần theo số kỳ học** — không cần thiết kế lifecycle policy/archival ở giai đoạn này.

## 9. Đã xác nhận (từ trao đổi với người dùng)

- ✅ **Triển khai theo giai đoạn**: UI local trước (mock data) → tích hợp API/AWS thật → AI Grader làm sau cùng (xem mục 0).
- ✅ **Khái niệm Assignment (đợt chấm)**: Admin tạo trước, Submitter chọn đúng đợt khi nộp; chống trùng tên nhóm chỉ scope trong 1 Assignment (xem mục 4.0, bảng `Assignments`/`Teams` ở mục 5).
- ✅ **Xuất điểm ra Excel theo nhóm**, gộp theo Assignment, kèm cột **tên thành viên + MSSV** (xem mục 4.4, 7).
- ✅ **Mock ở giai đoạn 1 dùng mock server** (MSW/JSON server) qua service layer, không chỉ giữ trong React state (xem mục 0).
- ✅ **Mỗi Assignment tạo nhóm độc lập** — không liên kết nhóm giữa các đợt (xem mục 4.0).
- ✅ **Xử lý lỗi khi chấm bài dùng Amazon SQS** + DLQ (xem mục 7).
- ✅ **Giới hạn file nộp bài**: tối đa 2 file (`.md` + `.xml`), mỗi file tối đa 5MB (xem mục 8.1).
- ✅ **Cognito Admin User Pool tắt self-signup**, tạo tài khoản Admin theo mô hình invite-only (xem mục 7).
- ✅ **Data retention**: giữ vô thời hạn, chấp nhận chi phí tăng dần (xem mục 8.4).
- ✅ **Hosting**: làm local trước, chưa cần chốt domain/CloudFront (xem mục 0).

- ✅ "Amazon Quick" = tên mới của Amazon Q (AI assistant của AWS), **có hỗ trợ gọi API** (Connector APIs, REST API Connection, agent invoke) — endpoint cụ thể cho use case chấm bài cần spike kỹ thuật ở bước design (xem mục 1).
- ✅ Rubric/tiêu chí: Admin sẽ nhập qua UI, bổ sung sau (chưa có ở giai đoạn context này).
- ✅ Điểm trả ra là **điểm tổng** (1 số), không tách theo từng tiêu chí.
- ✅ Tiêu chí flag `needsReview`: Admin sẽ bổ sung sau.
- ✅ **Form nộp bài chỉ gồm**: Tên nhóm; danh sách thành viên (thêm/xoá động) — mỗi thành viên có **tên, email, MSSV (tuỳ chọn)**; và **upload 2 file chung cho cả nhóm** (`.md`, `.xml`) — **không phải mỗi thành viên nộp riêng**. **Không có field tên trường.**
- ✅ Có trang Admin riêng: xem nhóm chưa chấm/đã chấm, chọn nhóm để chấm (on-demand), xem trực tiếp nội dung 2 file của nhóm trên web.
- ✅ **Chỉ Admin xem được điểm/feedback** — Submitter không có trang xem điểm.
- ✅ **Submitter không cần đăng nhập** — nộp bài công khai (kèm rate-limit/CAPTCHA để chống spam, xem mục 8.1).
- ✅ **Chính sách chống nộp trùng theo tên nhóm**: trùng tên nhóm đã nộp → chặn nộp; chỉ Admin mới mở khoá cho nhóm nộp lại (xem mục 4.1 và bảng `Teams`).
- ✅ **Admin bắt buộc đăng nhập qua Amazon Cognito**, tất cả Admin có quyền ngang nhau (không phân cấp).
- ✅ **Việc chấm bài (chấm hay không, chấm bài nào) hoàn toàn do Admin quyết định** — không có auto-trigger; chỉ có 1 con đường on-demand (xem mục 4.2, 4.4, 7).
- ✅ **Chấm bài theo đơn vị NHÓM, và mỗi nhóm chỉ có 1 bộ 2 file chung** (không phải mỗi thành viên 2 file) — Admin trigger chấm cho cả nhóm, AI chấm 1 lần trên 2 file đó, trả về 1 điểm duy nhất (xem bảng `GradingResults`, mục 5).
- ✅ **UX xác nhận nộp bài**: hiển thị thông báo "đã nộp bài thành công" ngay trên web nếu ghi DynamoDB thành công — không dùng email (xem mục 4.1).
- ✅ **Giữ lại toàn bộ lịch sử các lượt chấm cũ** khi nhóm được mở khoá và nộp lại — không xoá/đè kết quả chấm trước đó.
- ✅ Cấu trúc rubric: **để trống, chưa thiết kế** — sẽ làm ở bước sau khi có UI cấu hình rubric cho Admin.
- ✅ **Không có deadline nộp bài.**
- ✅ Quy mô dự kiến: **~500 người/kỳ học** — dùng để tham chiếu khi thiết kế partition key DynamoDB và ước lượng chi phí (quy mô này khá nhỏ, không cần lo về hot partition nếu partition key thiết kế theo `teamId`).
- ✅ Frontend: **React**.
- ✅ IaC: **AWS CDK**.
- ✅ Yêu cầu chú trọng bảo mật (mục 8.1), kiến trúc code chuẩn/dễ mở rộng/tối ưu hiệu năng (mục 8.2), UI theo chủ đề AWS Cloud/Cloudscape (mục 8.3).

## 10. Câu hỏi mở còn lại (cần quyết định trước khi vào design chi tiết)

1. **Spike kỹ thuật Amazon Quick**: xác định chính xác API/endpoint để gửi nội dung file + rubric và nhận điểm số có cấu trúc (JSON) — nhưng đã xác nhận việc này **làm sau cùng** (mục 0), không chặn tiến độ UI/backend hiện tại.
2. File `.xml` hiển thị trên trang Admin cần render đặc biệt gì không (ví dụ nếu là XML theo 1 schema kỹ thuật cụ thể, có cần hiển thị dạng cây/diagram) hay hiển thị dạng text/code là đủ?
3. Với quy mô ~500 người/kỳ (ước tính khoảng 100-150 nhóm nếu 3-5 người/nhóm) — có cần mình lập bảng ước tính chi phí AWS (Bedrock/Amazon Quick theo token, Lambda/DynamoDB/S3 theo request) không?
4. Cấu trúc file Excel: **1 dòng/nhóm** (thành viên gộp chung 1 cột) hay **1 dòng/thành viên** (điểm nhóm lặp lại ở mỗi dòng)? Cần chốt để khớp với format nhập điểm mà trường yêu cầu.
