import type { AuthUser, UserId } from '@daily-record/contracts';

import type { AuthPort } from '../auth';
import type { AuthErrorCode } from '../auth';

type CloudBaseError = {
  code?: unknown;
  errorCode?: unknown;
  message?: unknown;
  status?: unknown;
  category?: unknown;
};

type AuthOperation = 'request-otp' | 'verify-otp' | 'session' | 'sign-out';

type CloudBaseResult<T> = {
  data?: T | null;
  error?: CloudBaseError | null;
};

type CloudBaseUser = {
  id?: unknown;
};

type VerifyOtp = (params: {
  token: string;
}) => Promise<CloudBaseResult<{ user?: CloudBaseUser | null }>>;

export interface CloudBaseAuthClient {
  signInWithOtp(params: {
    email: string;
    options: { shouldCreateUser: true };
  }): Promise<CloudBaseResult<{ verifyOtp?: VerifyOtp }>>;
  getSession(): Promise<
    CloudBaseResult<{
      session?: { user?: CloudBaseUser | null } | null;
    }>
  >;
  signOut(): Promise<CloudBaseResult<unknown>>;
}

const safeMessages: Record<AuthErrorCode, string> = {
  'auth/configuration': '认证服务配置不完整。',
  'auth/invalid-email': '请输入有效的邮箱地址。',
  'auth/code-required': '请先获取并输入六位验证码。',
  'auth/code-expired': '验证码已过期，请重新获取。',
  'auth/code-invalid': '验证码不正确，请检查后重试。',
  'auth/captcha-required': '需要完成安全验证，请稍后重试。',
  'auth/rate-limited': '请求过于频繁，请稍后重试。',
  'auth/network': '网络连接失败，请检查网络后重试。',
  'auth/session': '登录会话无效，请重新登录。',
  'auth/unknown': '认证服务暂时不可用，请稍后重试。',
};

export class CloudBaseAuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message = safeMessages[code]) {
    super(message);
    this.name = 'CloudBaseAuthError';
    this.code = code;
  }
}

function normalizedString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizedErrorCode(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number(value);
  }
  return undefined;
}

function isOneOf(value: string, candidates: readonly string[]): boolean {
  return candidates.includes(value);
}

function isExpiredVerificationMessage(message: unknown): boolean {
  if (typeof message !== 'string') {
    return false;
  }
  const normalized = message.toLowerCase();
  return (
    normalized.includes('expired') ||
    normalized.includes('过期') ||
    normalized.includes('已失效')
  );
}

function mapProviderError(
  error: CloudBaseError,
  operation: AuthOperation,
): CloudBaseAuthError {
  const code = normalizedString(error.code);
  const status = normalizedString(error.status);
  const category = normalizedString(error.category);
  const errorCode = normalizedErrorCode(error.errorCode);

  if (isOneOf(code, ['invalid_email', 'email_invalid'])) {
    return new CloudBaseAuthError('auth/invalid-email');
  }
  if (
    code.includes('captcha') ||
    category === 'captcha_required' ||
    category === 'captcha_invalid' ||
    errorCode === 4001 ||
    errorCode === 4002 ||
    status === 'captcha_required' ||
    status === 'captcha_invalid'
  ) {
    return new CloudBaseAuthError('auth/captcha-required');
  }
  if (
    isOneOf(code, ['rate_limited', 'too_many_requests']) ||
    category === 'rate_limited' ||
    errorCode === 8 ||
    status === 'resource_exhausted' ||
    error.status === 429
  ) {
    return new CloudBaseAuthError('auth/rate-limited');
  }
  if (
    isOneOf(code, ['network', 'network_error', 'timeout']) ||
    isOneOf(status, ['unreachable', 'deadline_exceeded'])
  ) {
    return new CloudBaseAuthError('auth/network');
  }
  if (operation === 'verify-otp') {
    if (
      code.includes('expired') ||
      (category === 'verification_failed' &&
        isExpiredVerificationMessage(error.message))
    ) {
      return new CloudBaseAuthError('auth/code-expired');
    }
    if (
      isOneOf(code, ['invalid_otp', 'otp_invalid']) ||
      status === 'invalid_verification_code' ||
      category === 'invalid_credentials' ||
      category === 'verification_failed' ||
      (errorCode === 3 && status === 'invalid_argument')
    ) {
      return new CloudBaseAuthError('auth/code-invalid');
    }
  }
  if (
    (operation === 'session' || operation === 'sign-out') &&
    (errorCode === 16 ||
      status === 'unauthenticated' ||
      category === 'invalid_credentials' ||
      code.includes('token_expired'))
  ) {
    return new CloudBaseAuthError('auth/session');
  }
  return new CloudBaseAuthError('auth/unknown');
}

function mapThrownError(
  error: unknown,
  operation: AuthOperation,
): CloudBaseAuthError {
  if (error instanceof CloudBaseAuthError) {
    return error;
  }
  if (error instanceof TypeError) {
    return new CloudBaseAuthError('auth/network');
  }
  if (typeof error === 'object' && error !== null) {
    return mapProviderError(error as CloudBaseError, operation);
  }
  return new CloudBaseAuthError('auth/unknown');
}

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new CloudBaseAuthError('auth/invalid-email');
  }
  return normalized;
}

function requireCode(code: string): string {
  if (!/^\d{6}$/.test(code)) {
    throw new CloudBaseAuthError('auth/code-required');
  }
  return code;
}

function requireUser(user: CloudBaseUser | null | undefined): AuthUser {
  if (typeof user?.id !== 'string' || user.id.trim().length === 0) {
    throw new CloudBaseAuthError('auth/session');
  }
  return { userId: user.id as UserId };
}

function isNonRetryableVerificationError(code: AuthErrorCode): boolean {
  return (
    code === 'auth/code-expired' ||
    code === 'auth/captcha-required' ||
    code === 'auth/session' ||
    code === 'auth/configuration'
  );
}

export class CloudBaseAuthAdapter implements AuthPort {
  private readonly verifyOtpByEmail = new Map<string, VerifyOtp>();

  constructor(private readonly auth: CloudBaseAuthClient) {}

  async requestEmailCode(email: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email);
    let result: CloudBaseResult<{ verifyOtp?: VerifyOtp }>;

    try {
      result = await this.auth.signInWithOtp({
        email: normalizedEmail,
        options: { shouldCreateUser: true },
      });
    } catch (error) {
      throw mapThrownError(error, 'request-otp');
    }

    if (result.error) {
      throw mapProviderError(result.error, 'request-otp');
    }
    if (typeof result.data?.verifyOtp !== 'function') {
      this.verifyOtpByEmail.delete(normalizedEmail);
      throw new CloudBaseAuthError('auth/session');
    }

    this.verifyOtpByEmail.set(normalizedEmail, result.data.verifyOtp);
  }

  async verifyEmailCode(email: string, code: string): Promise<AuthUser> {
    const normalizedEmail = normalizeEmail(email);
    const token = requireCode(code);
    const verifyOtp = this.verifyOtpByEmail.get(normalizedEmail);
    if (!verifyOtp) {
      throw new CloudBaseAuthError('auth/code-required');
    }

    let result: CloudBaseResult<{ user?: CloudBaseUser | null }>;
    try {
      result = await verifyOtp({ token });
    } catch (error) {
      const stableError = mapThrownError(error, 'verify-otp');
      if (isNonRetryableVerificationError(stableError.code)) {
        this.verifyOtpByEmail.delete(normalizedEmail);
      }
      throw stableError;
    }

    if (result.error) {
      const stableError = mapProviderError(result.error, 'verify-otp');
      if (isNonRetryableVerificationError(stableError.code)) {
        this.verifyOtpByEmail.delete(normalizedEmail);
      }
      throw stableError;
    }

    try {
      const user = requireUser(result.data?.user);
      this.verifyOtpByEmail.delete(normalizedEmail);
      return user;
    } catch (error) {
      this.verifyOtpByEmail.delete(normalizedEmail);
      throw error;
    }
  }

  async currentUser(): Promise<AuthUser | null> {
    let result: Awaited<ReturnType<CloudBaseAuthClient['getSession']>>;
    try {
      result = await this.auth.getSession();
    } catch (error) {
      throw mapThrownError(error, 'session');
    }

    if (result.error) {
      throw mapProviderError(result.error, 'session');
    }
    if (result.data?.session === null) {
      return null;
    }
    if (!result.data?.session) {
      throw new CloudBaseAuthError('auth/session');
    }
    return requireUser(result.data.session.user);
  }

  async signOut(): Promise<void> {
    let result: CloudBaseResult<unknown>;
    try {
      result = await this.auth.signOut();
    } catch (error) {
      throw mapThrownError(error, 'sign-out');
    }

    if (result.error) {
      throw mapProviderError(result.error, 'sign-out');
    }
  }
}
