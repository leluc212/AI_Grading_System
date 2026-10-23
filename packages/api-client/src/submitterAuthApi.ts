/**
 * Service layer cho xác thực Submitter (Sinh viên) qua AWS Cognito + Google OAuth PKCE,
 * và lưu trữ/truy vấn Nhật ký đăng nhập (Login Audit Logs).
 */
import type {
  ListLoginLogsResponse,
  RecordLoginLogRequest,
  SubmitterIdentity,
} from '@quick-grading/shared-types';
import { apiFetch } from './http.js';

export interface SubmitterAuthConfig {
  googleClientId?: string;
  redirectUri?: string;
  userPoolClientId?: string;
  cognitoDomain?: string;
  region?: string;
}

export type SubmitterCognitoConfig = SubmitterAuthConfig;

const SUBMITTER_SESSION_KEY = 'quick-grading-submitter-session';
const PKCE_VERIFIER_KEY = 'quick-grading-pkce-verifier';
const PKCE_STATE_KEY = 'quick-grading-pkce-state';

let submitterConfig: SubmitterAuthConfig | null = null;

export function setSubmitterAuthConfig(config: SubmitterAuthConfig | null): void {
  submitterConfig = config;
}

export function getSubmitterAuthConfig(): SubmitterAuthConfig | null {
  return submitterConfig;
}

export const setSubmitterCognitoConfig = setSubmitterAuthConfig;
export const getSubmitterCognitoConfig = getSubmitterAuthConfig;

function hasSessionStorage(): boolean {
  return typeof sessionStorage !== 'undefined';
}

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

/** Tạo chuỗi ngẫu nhiên an toàn cho PKCE */
export function generateRandomString(length = 48): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const randomValues = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomValues);
  }
  let result = '';
  for (const byte of randomValues) {
    result += charset[byte % charset.length];
  }
  return result;
}

/** Tạo SHA-256 Code Challenge chuẩn Base64Url cho PKCE S256 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return base64UrlEncode(new Uint8Array(digest));
  }
  // Fallback đơn giản cho môi trường Node/test không có subtle crypto
  return verifier;
}

function base64UrlEncode(array: Uint8Array): string {
  let str = '';
  for (const byte of array) {
    str += String.fromCodePoint(byte);
  }
  return btoa(str).replaceAll('+', '-').replaceAll('/', '_').split('=')[0];
}

/** Giải mã phần payload của JWT an toàn (không cần thư viện bên thứ 3) */
export function parseJwtPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.');
    if (parts.length < 2) return {};
    const base64 = parts[1].replaceAll('-', '+').replaceAll('_', '/');
    const jsonStr = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + (c.codePointAt(0) ?? 0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export const submitterAuthApi = {
  setSubmitterAuthConfig,
  getSubmitterAuthConfig,
  setSubmitterCognitoConfig,
  getSubmitterCognitoConfig,

  /** Khởi tạo quá trình đăng nhập qua Google OAuth (trực tiếp hoặc Cognito) */
  async prepareGoogleLogin(): Promise<{ authUrl: string; state: string }> {
    const config = submitterConfig;
    const state = generateRandomString(16);
    const nonce = generateRandomString(16);

    if (hasSessionStorage()) {
      sessionStorage.setItem(PKCE_STATE_KEY, state);
      sessionStorage.setItem('quick-grading-oauth-nonce', nonce);
    }

    const redirectUri =
      config?.redirectUri ||
      (typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback`
        : 'http://localhost:5173/auth/callback');

    // 1. Trực tiếp Google OAuth 2.0 (Khuyên dùng)
    const googleClientId = config?.googleClientId;
    if (googleClientId) {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
        googleClientId,
      )}&redirect_uri=${encodeURIComponent(
        redirectUri,
      )}&response_type=id_token%20token&scope=openid%20email%20profile&state=${encodeURIComponent(
        state,
      )}&nonce=${encodeURIComponent(nonce)}&prompt=select_account`;
      return { authUrl, state };
    }

    // 2. AWS Cognito nếu có cấu hình
    if (config?.cognitoDomain && config?.userPoolClientId) {
      const verifier = generateRandomString(64);
      const challenge = await generateCodeChallenge(verifier);
      if (hasSessionStorage()) {
        sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
      }
      const domain = config.cognitoDomain.replace(/\/$/, '');
      const clientId = encodeURIComponent(config.userPoolClientId);
      const authUrl = `${domain}/oauth2/authorize?identity_provider=Google&client_id=${clientId}&response_type=code&scope=openid+email+profile&redirect_uri=${encodeURIComponent(
        redirectUri,
      )}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(
        challenge,
      )}&code_challenge_method=S256`;
      return { authUrl, state };
    }

    // 3. Fallback Mock mode nếu chưa cấu hình Google Client ID
    return {
      authUrl: `/auth/callback?mock=true&state=${state}`,
      state,
    };
  },

  /** Xử lý ID Token nhận được trực tiếp từ Google OAuth 2.0 OpenID Connect */
  handleGoogleIdToken(
    idToken: string,
    state?: string,
  ): { token: string; profile: SubmitterIdentity } {
    if (hasSessionStorage() && state) {
      const savedState = sessionStorage.getItem(PKCE_STATE_KEY);
      if (savedState && savedState !== state) {
        throw new Error('Lỗi bảo mật: CSRF state parameter không khớp.');
      }
    }

    const payload = parseJwtPayload(idToken);
    const email = typeof payload.email === 'string' ? payload.email : '';
    const name =
      typeof payload.name === 'string' && payload.name.trim().length > 0
        ? payload.name
        : email || 'Google User';
    const sub = typeof payload.sub === 'string' ? payload.sub : `google-sub-${Date.now()}`;

    if (!email) {
      throw new Error('Không nhận được thông tin email hợp lệ từ Google.');
    }

    const profile: SubmitterIdentity = {
      sub,
      email,
      name,
      provider: 'Google',
    };

    const session = { token: idToken, profile };
    this.saveSession(session);
    return session;
  },

  /** Đổi Authorization Code lấy Tokens từ Cognito Token endpoint */
  async handleAuthCallback(
    code: string,
    state: string,
  ): Promise<{ token: string; profile: SubmitterIdentity }> {
    if (hasSessionStorage()) {
      const savedState = sessionStorage.getItem(PKCE_STATE_KEY);
      if (savedState && savedState !== state) {
        throw new Error('Lỗi bảo mật: CSRF state parameter không khớp.');
      }
    }

    const verifier = hasSessionStorage() ? sessionStorage.getItem(PKCE_VERIFIER_KEY) || '' : '';
    const config = submitterConfig;

    // Chế độ Mock / Local development
    if (!config?.cognitoDomain || code === 'mock-auth-code') {
      const mockProfile: SubmitterIdentity = {
        sub: 'mock-google-sub-12345',
        email: 'student.fcaj@gmail.com',
        name: 'FCAJ Student',
        provider: 'Google',
      };
      const mockToken = 'mock-id-token-' + Date.now();
      this.saveSession({ token: mockToken, profile: mockProfile });
      return { token: mockToken, profile: mockProfile };
    }

    const domain = config.cognitoDomain.replace(/\/$/, '');
    const tokenEndpoint = `${domain}/oauth2/token`;

    const bodyParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.userPoolClientId || '',
      redirect_uri: config.redirectUri || '',
      code,
      code_verifier: verifier,
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1; application/x-www-form-urlencoded',
      },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      throw new Error(`Đổi mã xác thực thất bại: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      id_token: string;
      access_token: string;
      refresh_token?: string;
    };

    const claims = parseJwtPayload(data.id_token);
    const email = (claims.email as string) || '';
    const name = (claims.name as string) || (claims['cognito:username'] as string) || email;
    const sub = (claims.sub as string) || '';
    const avatarUrl = claims.picture as string | undefined;

    const profile: SubmitterIdentity = {
      sub,
      email,
      name,
      avatarUrl,
      provider: 'Google',
    };

    this.saveSession({ token: data.id_token, profile });

    if (hasSessionStorage()) {
      sessionStorage.removeItem(PKCE_VERIFIER_KEY);
      sessionStorage.removeItem(PKCE_STATE_KEY);
    }

    return { token: data.id_token, profile };
  },

  /** Lưu phiên sinh viên vào storage */
  saveSession(session: { token: string; profile: SubmitterIdentity }): void {
    if (hasLocalStorage()) {
      localStorage.setItem(SUBMITTER_SESSION_KEY, JSON.stringify(session));
    }
  },

  /** Đọc phiên sinh viên hiện tại */
  getCurrentSession(): { token: string; profile: SubmitterIdentity } | null {
    if (!hasLocalStorage()) return null;
    const raw = localStorage.getItem(SUBMITTER_SESSION_KEY);
    if (!raw) return null;
    try {
      const data = JSON.parse(raw) as { token: string; profile: SubmitterIdentity };
      if (data?.token && data?.profile?.email) {
        return data;
      }
      return null;
    } catch {
      return null;
    }
  },

  /** Đăng xuất phiên sinh viên */
  logout(): void {
    if (hasLocalStorage()) {
      localStorage.removeItem(SUBMITTER_SESSION_KEY);
    }
    if (hasSessionStorage()) {
      sessionStorage.removeItem(PKCE_VERIFIER_KEY);
      sessionStorage.removeItem(PKCE_STATE_KEY);
    }
  },

  /** Ghi nhận phiên đăng nhập vào hệ thống để Admin theo dõi audit log */
  async recordLoginAuditLog(
    req: RecordLoginLogRequest,
    token?: string,
  ): Promise<{ success: boolean; logId: string }> {
    return apiFetch<{ success: boolean; logId: string }>('/api/auth/submitter-login-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(req),
    });
  },

  /** Truy vấn danh sách nhật ký đăng nhập (Dành cho trang Admin) */
  async listLoginAuditLogs(params?: {
    limit?: number;
    nextToken?: string;
  }): Promise<ListLoginLogsResponse> {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.nextToken) query.set('nextToken', params.nextToken);
    const qs = query.toString();
    const endpoint = qs ? `/api/admin/login-logs?${qs}` : '/api/admin/login-logs';
    return apiFetch<ListLoginLogsResponse>(endpoint);
  },
};
