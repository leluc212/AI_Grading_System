/**
 * Helper `fetch` dùng chung cho toàn bộ service layer (`assignmentsApi`,
 * `teamsApi`, ... — xem design.md > API Contract (Service Layer)).
 *
 * Vai trò chính:
 *   1. Gói `fetch` gửi/nhận JSON (và cả multipart/form-data cho upload file).
 *   2. Khi response KHÔNG OK, đọc body lỗi dạng `{ code, message }` (format
 *      thống nhất mà mọi mock handler trả về — xem design.md > Error
 *      Handling) rồi map `code` về đúng typed error class ở
 *      `@quick-grading/shared-types` và NÉM nó ra. Đây chính là phần "map
 *      lỗi HTTP sang typed error" của task 4.1, giúp UI xử lý hiển thị lỗi
 *      nhất quán giữa mock (giai đoạn 1) và API Gateway/Lambda thật (giai
 *      đoạn 2) mà không đổi call site.
 *
 * Toàn bộ request đi qua `API_BASE_URL` (mặc định '' -> same-origin
 * `/api/...`, đúng thứ MSW intercept). Giai đoạn 2 chỉ cần đổi base URL để
 * trỏ sang API Gateway thật, KHÔNG đổi signature các hàm service layer
 * (design.md > Migration Notes). Không có nhánh if/else "nếu mock thì..."
 * — code trông y như gọi API thật (design.md > Mock Server Design).
 *
 * _Requirements: 12.1, 12.2, 12.3_
 */
import {
  AssignmentClosedError,
  GradingInProgressError,
  NotFoundError,
  TeamNameConflictError,
  UnauthorizedError,
  ValidationError,
} from '@quick-grading/shared-types';

/**
 * Đọc base URL từ biến môi trường nếu có (chỉ tồn tại khi chạy Node/test).
 *
 * Ở trình duyệt (bản build thật của web-submitter/web-admin) KHÔNG có
 * `process`, nên hàm này rơi về '' -> request same-origin `/api/...` đúng như
 * hành vi production mặc định. Ở môi trường test (Vitest chạy trên Node),
 * `fetch` của Node yêu cầu URL tuyệt đối và KHÔNG resolve được path tương
 * đối; test set `QG_API_BASE_URL='http://localhost'` để mọi request trỏ tới
 * 1 origin tuyệt đối mà MSW (`msw/node`) intercept theo pathname. Không call
 * site nào phải đổi — chỉ base URL thay đổi (design.md > Migration Notes).
 */
function readApiBaseUrl(): string {
  // Truy cập `process` qua `globalThis` + cast để KHÔNG cần `@types/node`
  // trong cấu hình build (lib chỉ có DOM). Trình duyệt không có `process` ->
  // trả '' như mặc định production.
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  if (env && typeof env.QG_API_BASE_URL === 'string') {
    return env.QG_API_BASE_URL;
  }
  return '';
}

/**
 * Base URL cho mọi request tới service layer.
 *
 * Mặc định '' -> request dạng same-origin `/api/...` (chính là path mà MSW
 * đăng ký intercept ở giai đoạn 1). Đặt qua 1 hằng số duy nhất để giai đoạn
 * 2 chỉ cần đổi ở đây (hoặc inject từ env qua `QG_API_BASE_URL`) là trỏ được
 * sang API Gateway thật — không call site nào phải sửa (design.md >
 * Migration Notes).
 */
export const API_BASE_URL: string = readApiBaseUrl();

/** Shape body lỗi thống nhất từ mọi handler: `{ code, message }`. */
interface ApiErrorBody {
  code?: unknown;
  message?: unknown;
}

/**
 * Dựng lại đúng typed error class từ `{ code, message }` mà server trả về.
 *
 * Body lỗi chỉ mang `code` + `message` (không kèm các field phụ như
 * `teamName`/`assignmentId`/`resourceId` mà 1 số constructor có). Vì mục
 * đích ở FE là hiển thị đúng `message` + phân biệt loại lỗi qua `instanceof`,
 * ta truyền thẳng `message` của server vào tham số message của constructor
 * (nên text hiển thị luôn khớp server) và dùng chuỗi rỗng làm placeholder
 * cho các field id không có trong body. Task 4.2/4.3 sẽ khai thác/kiểm thử
 * thêm hành vi này.
 *
 * Nếu `code` không nhận diện được (hoặc body không đúng shape), trả về 1
 * `Error` chung với `message` tốt nhất có được — tránh nuốt lỗi.
 */
function mapErrorBodyToTypedError(status: number, body: ApiErrorBody | null): Error {
  const code = typeof body?.code === 'string' ? body.code : undefined;
  const message = typeof body?.message === 'string' ? body.message : undefined;

  switch (code) {
    case 'VALIDATION_ERROR':
      return new ValidationError(message ?? 'Dữ liệu không hợp lệ.');
    case 'TEAM_NAME_CONFLICT':
      // teamName/assignmentId không có trong body -> placeholder rỗng, giữ
      // nguyên message server để hiển thị đúng.
      return new TeamNameConflictError('', '', message);
    case 'ASSIGNMENT_CLOSED':
      return new AssignmentClosedError('', message);
    case 'GRADING_IN_PROGRESS':
      return new GradingInProgressError('', message);
    case 'NOT_FOUND':
      return new NotFoundError('', '', message);
    case 'UNAUTHORIZED':
      return new UnauthorizedError(message);
    default:
      // Không map được: fallback về Error chung, kèm status để dễ debug.
      return new Error(message ?? `Yêu cầu thất bại với HTTP ${status}.`);
  }
}

/**
 * Đọc response lỗi (`!response.ok`) và NÉM đúng typed error tương ứng.
 *
 * Cố đọc body JSON `{ code, message }`; nếu body rỗng/không phải JSON thì
 * vẫn ném lỗi (fallback) dựa trên HTTP status, không crash vì parse lỗi.
 */
async function throwTypedError(response: Response): Promise<never> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // Body không phải JSON hợp lệ (hoặc rỗng) — giữ body = null, để
    // mapErrorBodyToTypedError xử lý fallback theo status.
    body = null;
  }
  throw mapErrorBodyToTypedError(response.status, body);
}

/**
 * Gửi 1 request và parse response JSON thành `T`.
 *
 * - Ghép `path` sau `API_BASE_URL`.
 * - Nếu `!response.ok`: đọc `{ code, message }` và ném typed error.
 * - Nếu OK: parse và trả về JSON body dưới dạng `T`.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    await throwTypedError(response);
  }
  return (await response.json()) as T;
}

/**
 * Gửi 1 request mà response KHÔNG có body cần parse (dạng `204 No Content`).
 *
 * Vì sao cần helper riêng: `apiFetch` luôn gọi `response.json()` khi OK —
 * điều này SẼ throw với 1 response `204` rỗng (không có JSON để parse). Các
 * endpoint dạng "hành động, không trả dữ liệu" (ví dụ `POST /api/auth/logout`
 * trả `204`) cần đi qua đây: vẫn map lỗi HTTP sang typed error như thường,
 * nhưng khi OK thì trả về `void` mà KHÔNG chạm vào body. Không đụng gì tới
 * `apiFetch` nên mọi caller trả JSON hiện có (assignments/teams/...) không
 * đổi hành vi.
 */
export async function apiFetchVoid(path: string, init?: RequestInit): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (!response.ok) {
    await throwTypedError(response);
  }
  // OK: cố tình KHÔNG đọc body (204/empty) — tránh lỗi parse JSON.
}

/**
 * Tiện ích gửi request có body JSON (POST/PATCH/PUT...).
 *
 * Tự set header `Content-Type: application/json` và stringify `body`.
 */
export function apiFetchJson<T>(path: string, method: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Tiện ích gửi request `multipart/form-data` (upload file).
 *
 * KHÔNG tự set `Content-Type` — trình duyệt sẽ tự thêm boundary chính xác
 * khi body là `FormData`. Set tay sẽ làm hỏng boundary.
 */
export function apiFetchFormData<T>(path: string, method: string, formData: FormData): Promise<T> {
  return apiFetch<T>(path, { method, body: formData });
}

/**
 * Dựng query string từ các cặp key/value (bỏ qua giá trị `undefined`), có
 * URL-encode. Trả về chuỗi bắt đầu bằng `?` nếu có ít nhất 1 tham số, ngược
 * lại trả về chuỗi rỗng.
 */
export function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.append(key, value);
    }
  }
  const queryString = search.toString();
  return queryString.length > 0 ? `?${queryString}` : '';
}
