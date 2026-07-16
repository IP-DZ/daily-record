import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthUser } from '@daily-record/contracts';

import type { AuthPort } from '../../platform/auth';
import { AuthPage } from './AuthPage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createAuth(overrides: Partial<AuthPort> = {}): AuthPort {
  return {
    requestEmailCode: vi.fn().mockResolvedValue(undefined),
    verifyEmailCode: vi.fn().mockResolvedValue({ userId: 'user-1' }),
    currentUser: vi.fn().mockResolvedValue(null),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as AuthPort;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AuthPage', () => {
  it.each(['not-an-email', 'a@b..com', 'a@-x.com', 'a@example.com.'])(
    'rejects invalid email %s locally without calling the port',
    async (invalidEmail) => {
    const auth = createAuth();
    const user = userEvent.setup();
    render(<AuthPage auth={auth} onAuthenticated={vi.fn()} />);

    await user.type(screen.getByLabelText('邮箱'), invalidEmail);
    await user.click(screen.getByRole('button', { name: '获取验证码' }));

    expect(auth.requestEmailCode).not.toHaveBeenCalled();
    const error = screen.getByText('请输入有效的邮箱地址。');
    expect(error).toBeInTheDocument();
    expect(screen.getByLabelText('邮箱')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('邮箱')).toHaveAttribute('aria-describedby', error.id);
    expect(screen.queryByLabelText('六位验证码')).not.toBeInTheDocument();
    },
  );

  it('prevents concurrent email-code requests', async () => {
    const request = deferred<void>();
    const auth = createAuth({ requestEmailCode: vi.fn(() => request.promise) });
    render(<AuthPage auth={auth} onAuthenticated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } });
    const submit = screen.getByRole('button', { name: '获取验证码' });
    fireEvent.click(submit);
    fireEvent.submit(submit.closest('form')!);

    expect(auth.requestEmailCode).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    await act(async () => request.resolve());
  });

  it('normalizes email, enters OTP stage only after success, and cleans up the cooldown timer', async () => {
    vi.useFakeTimers();
    const request = deferred<void>();
    const auth = createAuth({ requestEmailCode: vi.fn(() => request.promise) });
    const { unmount } = render(<AuthPage auth={auth} onAuthenticated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: ' USER@Example.com ' } });
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    expect(screen.queryByLabelText('六位验证码')).not.toBeInTheDocument();

    await act(async () => request.resolve());
    expect(screen.getByLabelText('六位验证码')).toBeInTheDocument();
    expect(auth.requestEmailCode).toHaveBeenCalledWith('user@example.com');
    expect(screen.getByRole('button', { name: '60 秒后可重发' })).toBeDisabled();

    await act(async () => vi.advanceTimersByTime(59_000));
    expect(screen.getByRole('button', { name: '1 秒后可重发' })).toBeDisabled();
    await act(async () => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole('button', { name: '重新发送验证码' })).toBeEnabled();

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('requires exactly six digits and prevents concurrent verification', async () => {
    const verification = deferred<AuthUser>();
    const auth = createAuth({ verifyEmailCode: vi.fn(() => verification.promise) });
    const onAuthenticated = vi.fn();
    const user = userEvent.setup();
    render(<AuthPage auth={auth} onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByLabelText('邮箱'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: '获取验证码' }));
    const code = await screen.findByLabelText('六位验证码');
    await user.type(code, '12345');
    await user.click(screen.getByRole('button', { name: '注册或登录' }));
    expect(auth.verifyEmailCode).not.toHaveBeenCalled();
    expect(screen.getByText('请输入六位数字验证码。')).toBeInTheDocument();

    await user.type(code, '6');
    const submit = screen.getByRole('button', { name: '注册或登录' });
    await user.click(submit);
    fireEvent.submit(submit.closest('form')!);
    expect(auth.verifyEmailCode).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();

    verification.resolve({ userId: 'user-1' as AuthUser['userId'] });
    expect(await screen.findByText('正在进入…')).toBeInTheDocument();
    expect(onAuthenticated).toHaveBeenCalledWith({ userId: 'user-1' });
  });

  it('maps provider failures to safe Chinese messages without exposing credentials', async () => {
    const rawEmail = 'private@example.com';
    const rawCode = '987654';
    const auth = createAuth({
      verifyEmailCode: vi.fn().mockRejectedValue({
        code: 'auth/captcha-required',
        message: `provider leaked ${rawEmail} ${rawCode}`,
      }),
    });
    const user = userEvent.setup();
    render(<AuthPage auth={auth} onAuthenticated={vi.fn()} />);

    await user.type(screen.getByLabelText('邮箱'), rawEmail);
    await user.click(screen.getByRole('button', { name: '获取验证码' }));
    await user.type(await screen.findByLabelText('六位验证码'), rawCode);
    await user.click(screen.getByRole('button', { name: '注册或登录' }));

    expect(await screen.findByText('需要完成安全验证，请稍后重试。')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('provider leaked');
    expect(document.body.textContent).not.toContain(rawEmail);
    expect(document.body.textContent).not.toContain(rawCode);
    const error = screen.getByText('需要完成安全验证，请稍后重试。');
    expect(screen.getByLabelText('六位验证码')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('六位验证码')).toHaveAttribute('aria-describedby', error.id);
  });

  it('ignores a pending request completion after unmount', async () => {
    const request = deferred<void>();
    const auth = createAuth({ requestEmailCode: vi.fn(() => request.promise) });
    const { unmount } = render(<AuthPage auth={auth} onAuthenticated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    unmount();

    await act(async () => request.resolve());
    expect(auth.requestEmailCode).toHaveBeenCalledTimes(1);
  });

  it('does not enter the OTP stage when a request from an old auth instance completes', async () => {
    const request = deferred<void>();
    const authA = createAuth({ requestEmailCode: vi.fn(() => request.promise) });
    const authB = createAuth();
    const { rerender } = render(<AuthPage auth={authA} onAuthenticated={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    rerender(<AuthPage auth={authB} onAuthenticated={vi.fn()} />);
    await act(async () => request.resolve());

    expect(screen.queryByLabelText('六位验证码')).not.toBeInTheDocument();
    expect(screen.getByLabelText('邮箱')).toBeEnabled();
  });

  it('ignores verification from an old auth instance after auth changes', async () => {
    const verification = deferred<AuthUser>();
    const authA = createAuth({ verifyEmailCode: vi.fn(() => verification.promise) });
    const authB = createAuth();
    const onAuthenticated = vi.fn();
    const { rerender } = render(<AuthPage auth={authA} onAuthenticated={onAuthenticated} />);

    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: '获取验证码' }));
    await screen.findByLabelText('六位验证码');
    fireEvent.change(screen.getByLabelText('六位验证码'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '注册或登录' }));

    rerender(<AuthPage auth={authB} onAuthenticated={onAuthenticated} />);
    await act(async () => verification.resolve({ userId: 'old-user' as AuthUser['userId'] }));

    expect(onAuthenticated).not.toHaveBeenCalled();
  });
});
