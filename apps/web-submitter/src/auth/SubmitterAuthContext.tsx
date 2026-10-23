/**
 * Context quản lý trạng thái đăng nhập của Sinh viên (Submitter) qua AWS Cognito + Google OAuth PKCE.
 * Đảm bảo xác thực chống spam và lưu trữ phiên an toàn.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SubmitterIdentity } from '@quick-grading/shared-types';
import { submitterAuthApi } from '@quick-grading/api-client';

export interface SubmitterAuthContextValue {
  user: SubmitterIdentity | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithGoogle: () => Promise<void>;
  loginWithMockGoogle: (customEmail?: string, customName?: string) => Promise<void>;
  logout: () => void;
}

const SubmitterAuthContext = createContext<SubmitterAuthContextValue | null>(null);

export function SubmitterAuthProvider({ children }: { readonly children: ReactNode }) {
  const [session, setSession] = useState<{
    token: string;
    profile: SubmitterIdentity;
  } | null>(() => {
    return submitterAuthApi.getCurrentSession();
  });
  const [isLoading, setIsLoading] = useState(false);

  // Đồng bộ session khi có thay đổi từ tab khác
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'quick-grading-submitter-session') {
        setSession(submitterAuthApi.getCurrentSession());
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setIsLoading(true);
    try {
      const { authUrl } = await submitterAuthApi.prepareGoogleLogin();
      // Điều hướng tới Cognito Hosted UI / Google IdP
      window.location.href = authUrl;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loginWithMockGoogle = useCallback(
    async (customEmail = 'student.fcaj@gmail.com', customName = 'FCAJ Student') => {
      setIsLoading(true);
      try {
        const mockProfile: SubmitterIdentity = {
          sub: 'mock-google-sub-' + Math.random().toString(36).substring(2, 9),
          email: customEmail,
          name: customName,
          provider: 'Google',
        };
        const mockToken = 'mock-google-token-' + Date.now();
        const newSession = { token: mockToken, profile: mockProfile };
        submitterAuthApi.saveSession(newSession);
        setSession(newSession);

        // Ghi nhận audit log đăng nhập
        try {
          await submitterAuthApi.recordLoginAuditLog(
            {
              email: customEmail,
              name: customName,
              userSub: mockProfile.sub,
              provider: 'Google',
            },
            mockToken,
          );
        } catch (logErr) {
          console.warn('[SubmitterAuth] Không thể ghi nhận audit log:', logErr);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(() => {
    submitterAuthApi.logout();
    setSession(null);
  }, []);

  const contextValue = useMemo<SubmitterAuthContextValue>(
    () => ({
      user: session?.profile ?? null,
      token: session?.token ?? null,
      isAuthenticated: Boolean(session?.token && session?.profile?.email),
      isLoading,
      loginWithGoogle,
      loginWithMockGoogle,
      logout,
    }),
    [session, isLoading, loginWithGoogle, loginWithMockGoogle, logout],
  );

  return (
    <SubmitterAuthContext.Provider value={contextValue}>{children}</SubmitterAuthContext.Provider>
  );
}

export function useSubmitterAuth() {
  const context = useContext(SubmitterAuthContext);
  if (!context) {
    throw new Error('useSubmitterAuth phải được sử dụng bên trong SubmitterAuthProvider');
  }
  return context;
}
