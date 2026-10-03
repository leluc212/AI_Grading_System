/**
 * Trang đăng nhập khu vực Admin (task 6.2).
 *
 * Giai đoạn 1 dùng mock auth: form username/password gọi
 * `authApi.login` (mock server có 1 tài khoản admin cứng để test — xem
 * `packages/mock-server/src/handlers/auth.ts`). Giai đoạn 2 trang này được
 * thay bằng Cognito Hosted UI, nên CỐ TÌNH không có gì ngoài form đăng nhập
 * tối thiểu: không "ghi nhớ đăng nhập", không "quên mật khẩu", không tự đăng
 * ký (Requirement 4.2: Cognito tắt self-signup — tài khoản do người vận hành
 * tạo).
 *
 * Thông tin tài khoản test KHÔNG được in lên UI: nó chỉ đúng với mock server
 * và sẽ thành thông tin sai lệch (hoặc thói quen xấu) khi sang giai đoạn 2.
 * Xem README của `mock-server` nếu cần tra tài khoản để test.
 *
 * _Requirements: 4.1, 4.4_
 */
import { useCallback, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import Alert from '@cloudscape-design/components/alert';
import Box from '@cloudscape-design/components/box';
import Button from '@cloudscape-design/components/button';
import Container from '@cloudscape-design/components/container';
import Form from '@cloudscape-design/components/form';
import FormField from '@cloudscape-design/components/form-field';
import Header from '@cloudscape-design/components/header';
import Input from '@cloudscape-design/components/input';
import SpaceBetween from '@cloudscape-design/components/space-between';
import { useAdminAuth } from '../auth/AdminAuthContext';
import { toDisplayMessage } from '../errorMessage';

/** Đường dẫn mặc định sau khi đăng nhập, khi không có URL nào bị chặn trước đó. */
const DEFAULT_LANDING_PATH = '/assignments';

/**
 * Lấy URL mà route guard đã chặn (nếu có) để đăng nhập xong quay lại đúng chỗ.
 *
 * `location.state` do client đặt nên phải kiểm tra shape trước khi dùng; và
 * chỉ nhận đường dẫn nội bộ bắt đầu bằng 1 dấu `/`. Chuỗi như
 * `//evil.example.com` hay `https://...` bị bỏ qua để không biến state thành
 * một open redirect.
 */
function readRedirectPath(state: unknown): string {
  if (typeof state !== 'object' || state === null) {
    return DEFAULT_LANDING_PATH;
  }
  const from = (state as { from?: unknown }).from;
  if (typeof from !== 'string' || !from.startsWith('/') || from.startsWith('//')) {
    return DEFAULT_LANDING_PATH;
  }
  return from;
}

export function LoginPage() {
  const { isAuthenticated, signIn } = useAdminAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState<string | undefined>(undefined);
  const [passwordError, setPasswordError] = useState<string | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  const redirectPath = readRedirectPath(location.state);

  const handleSubmit = useCallback(async () => {
    // Validate tối thiểu ở client để không gửi request chắc chắn sai.
    const nextUsernameError =
      username.trim().length === 0 ? 'Tên đăng nhập không được để trống.' : undefined;
    const nextPasswordError = password.length === 0 ? 'Mật khẩu không được để trống.' : undefined;
    setUsernameError(nextUsernameError);
    setPasswordError(nextPasswordError);
    setSubmitError(undefined);

    if (nextUsernameError !== undefined || nextPasswordError !== undefined) {
      return;
    }

    setSubmitting(true);
    try {
      await signIn(username.trim(), password);
      // Điều hướng tay (thay vì chờ `isAuthenticated` đổi rồi render
      // `<Navigate>`) để giữ được `replace` — trang đăng nhập không nên nằm
      // lại trong history sau khi đã vào được khu vực Admin.
      navigate(redirectPath, { replace: true });
    } catch (error: unknown) {
      console.error('[LoginPage] Đăng nhập thất bại:', error);
      // `UnauthorizedError` đã có câu "Tài khoản hoặc mật khẩu không đúng."
      // (Requirement 4.4), hiển thị nguyên văn.
      setSubmitError(
        toDisplayMessage(error, 'Không đăng nhập được do lỗi hệ thống. Vui lòng thử lại.'),
      );
      // Xoá mật khẩu đã nhập, giữ lại tên đăng nhập: gõ lại mật khẩu là
      // chuyện bình thường, còn bắt gõ lại username thì chỉ gây khó chịu.
      setPassword('');
    } finally {
      setSubmitting(false);
    }
  }, [navigate, password, redirectPath, signIn, username]);

  // Đã đăng nhập mà vẫn mở `/login` (gõ URL, hoặc bấm Back) -> không cần đăng
  // nhập lại.
  if (isAuthenticated) {
    return <Navigate to={redirectPath} replace />;
  }

  return (
    <Box padding="xxl">
      {/*
        Canh giữa + giới hạn bề rộng bằng style thường: `Box` của Cloudscape
        chỉ nhận các token khoảng cách (`xs`, `s`, `m`, ...) cho `margin`, nên
        không truyền được `auto` để canh giữa.
      */}
      <div style={{ maxWidth: 420, margin: '0 auto' }}>
        <form
          // `noValidate`: tắt constraint validation của trình duyệt để thông
          // báo lỗi luôn là của Cloudscape, không phải tooltip mặc định
          // (design.md > Error Handling).
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <Form
            actions={
              <Button variant="primary" formAction="submit" loading={submitting}>
                Đăng nhập
              </Button>
            }
          >
            <Container
              header={
                <Header variant="h1" description="Khu vực quản trị — yêu cầu đăng nhập">
                  Quick Grading
                </Header>
              }
            >
              <SpaceBetween size="l">
                {submitError !== undefined && (
                  <Alert type="error" header="Không đăng nhập được">
                    {submitError}
                  </Alert>
                )}

                <FormField label="Tên đăng nhập" errorText={usernameError}>
                  <Input
                    value={username}
                    disabled={submitting}
                    autoFocus
                    ariaLabel="Tên đăng nhập"
                    onChange={({ detail }) => setUsername(detail.value)}
                  />
                </FormField>

                <FormField label="Mật khẩu" errorText={passwordError}>
                  <Input
                    value={password}
                    disabled={submitting}
                    type="password"
                    ariaLabel="Mật khẩu"
                    onChange={({ detail }) => setPassword(detail.value)}
                  />
                </FormField>
              </SpaceBetween>
            </Container>
          </Form>
        </form>
      </div>
    </Box>
  );
}
