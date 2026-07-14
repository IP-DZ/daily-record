import { useEffect, useRef, useState } from 'react';
import { emailSchema, type AuthUser } from '@daily-record/contracts';

import type { AuthErrorCode, AuthPort } from '../../platform/auth';
import './auth.css';

interface AuthPageProps {
  auth: AuthPort;
  onAuthenticated(user: AuthUser): void;
  initialError?: string | null;
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

function safeAuthMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code in safeMessages) {
      return safeMessages[code as AuthErrorCode];
    }
  }
  return safeMessages['auth/unknown'];
}

function normalizeEmail(value: string): string | null {
  const result = emailSchema.safeParse(value);
  return result.success ? result.data : null;
}

export function AuthPage({ auth, onAuthenticated, initialError = null }: AuthPageProps) {
  const [emailInput, setEmailInput] = useState('');
  const [requestedEmail, setRequestedEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const requestPending = useRef<AuthPort | null>(null);
  const verificationPending = useRef<AuthPort | null>(null);
  const mounted = useRef(false);
  const currentAuth = useRef(auth);
  currentAuth.current = auth;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    requestPending.current = null;
    verificationPending.current = null;
    setEmailInput('');
    setRequestedEmail(null);
    setCode('');
    setCooldown(0);
    setErrorMessage(initialError);
    setIsRequesting(false);
    setIsVerifying(false);
    setAuthenticated(false);
  }, [auth, initialError]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((value) => Math.max(0, value - 1));
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [cooldown > 0]);

  async function requestCode() {
    if (requestPending.current === auth || cooldown > 0) return;
    const normalizedEmail = normalizeEmail(requestedEmail ?? emailInput);
    if (normalizedEmail === null) {
      setErrorMessage(safeMessages['auth/invalid-email']);
      return;
    }

    const operationAuth = auth;
    requestPending.current = operationAuth;
    setIsRequesting(true);
    setErrorMessage(null);
    try {
      await auth.requestEmailCode(normalizedEmail);
      if (mounted.current && currentAuth.current === operationAuth) {
        setRequestedEmail(normalizedEmail);
        setCooldown(60);
      }
    } catch (error) {
      if (mounted.current && currentAuth.current === operationAuth) {
        setErrorMessage(safeAuthMessage(error));
      }
    } finally {
      if (requestPending.current === operationAuth) requestPending.current = null;
      if (mounted.current && currentAuth.current === operationAuth) {
        setIsRequesting(false);
      }
    }
  }

  async function verifyCode() {
    if (verificationPending.current === auth || requestedEmail === null) return;
    if (!/^\d{6}$/.test(code)) {
      setErrorMessage('请输入六位数字验证码。');
      return;
    }

    const operationAuth = auth;
    verificationPending.current = operationAuth;
    setIsVerifying(true);
    setErrorMessage(null);
    try {
      const user = await auth.verifyEmailCode(requestedEmail, code);
      if (mounted.current && currentAuth.current === operationAuth) {
        setCode('');
        setAuthenticated(true);
        onAuthenticated(user);
      }
    } catch (error) {
      if (mounted.current && currentAuth.current === operationAuth) {
        setCode('');
        setErrorMessage(safeAuthMessage(error));
      }
    } finally {
      if (verificationPending.current === operationAuth) verificationPending.current = null;
      if (mounted.current && currentAuth.current === operationAuth) {
        setIsVerifying(false);
      }
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="auth-eyebrow">每日记录</p>
        <h1>注册或登录</h1>
        <p>邮箱验证码用于注册或登录，无需设置密码。</p>

        {requestedEmail === null ? (
          <form
            className="auth-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void requestCode();
            }}
          >
            <label htmlFor="auth-email">邮箱</label>
            <input
              id="auth-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={emailInput}
              disabled={isRequesting}
              aria-invalid={errorMessage !== null}
              aria-describedby={errorMessage ? 'auth-error' : undefined}
              onChange={(event) => {
                setEmailInput(event.target.value);
                setErrorMessage(null);
              }}
            />
            <button type="submit" disabled={isRequesting}>
              {isRequesting ? '正在发送…' : '获取验证码'}
            </button>
          </form>
        ) : (
          <form
            className="auth-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void verifyCode();
            }}
          >
            <p className="auth-hint">验证码已发送，请查看邮箱。</p>
            <label htmlFor="auth-code">六位验证码</label>
            <input
              id="auth-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              disabled={isVerifying || authenticated}
              aria-invalid={errorMessage !== null}
              aria-describedby={errorMessage ? 'auth-error' : undefined}
              onChange={(event) => {
                setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
                setErrorMessage(null);
              }}
            />
            <button type="submit" disabled={isVerifying || authenticated}>
              {authenticated ? '正在进入…' : isVerifying ? '正在验证…' : '注册或登录'}
            </button>
            <button
              className="auth-secondary"
              type="button"
              disabled={cooldown > 0 || isRequesting || isVerifying || authenticated}
              onClick={() => void requestCode()}
            >
              {cooldown > 0 ? `${cooldown} 秒后可重发` : isRequesting ? '正在发送…' : '重新发送验证码'}
            </button>
          </form>
        )}

        {errorMessage && <p id="auth-error" className="auth-error" role="alert">{errorMessage}</p>}
      </section>
    </main>
  );
}

export { safeAuthMessage };
