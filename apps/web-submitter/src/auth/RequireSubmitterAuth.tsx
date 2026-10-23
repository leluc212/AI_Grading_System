/**
 * Route guard bảo vệ các trang yêu cầu đăng nhập (ví dụ: form nộp bài).
 * Nếu chưa đăng nhập, tự động chuyển hướng sang /login và ghi nhớ đường dẫn ban đầu.
 */
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSubmitterAuth } from './SubmitterAuthContext';

export function RequireSubmitterAuth({ children }: { readonly children: ReactNode }) {
  const { isAuthenticated } = useSubmitterAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  return <>{children}</>;
}
