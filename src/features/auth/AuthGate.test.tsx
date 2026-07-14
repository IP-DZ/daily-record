import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AuthPort } from '../../platform/auth';
import { AuthGate } from './AuthGate';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function authPort(overrides: Partial<AuthPort>): AuthPort {
  return {
    requestEmailCode: vi.fn().mockResolvedValue(undefined),
    verifyEmailCode: vi.fn().mockResolvedValue({ userId: 'user-1' }),
    currentUser: vi.fn().mockResolvedValue(null),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as AuthPort;
}

afterEach(cleanup);

describe('AuthGate', () => {
  it('restores the current user once without flashing the login form', async () => {
    const session = deferred<{ userId: string } | null>();
    const auth = authPort({ currentUser: vi.fn(() => session.promise) as AuthPort['currentUser'] });
    render(<AuthGate auth={auth}><h1>设置你的增肌目标</h1></AuthGate>);

    expect(screen.getByRole('status')).toHaveTextContent('正在恢复登录状态…');
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();
    session.resolve({ userId: 'user-1' });

    expect(await screen.findByRole('heading', { name: '设置你的增肌目标' })).toBeInTheDocument();
    expect(auth.currentUser).toHaveBeenCalledTimes(1);
  });

  it('exposes only the authenticated user to protected rendering', async () => {
    const auth = authPort({ currentUser: vi.fn().mockResolvedValue({ userId: 'user-safe' }) });
    render(
      <AuthGate auth={auth}>
        {(user) => <h1>{user.userId}</h1>}
      </AuthGate>,
    );

    expect(await screen.findByRole('heading', { name: 'user-safe' })).toBeInTheDocument();
  });

  it('runs current-user cleanup only after sign-out succeeds', async () => {
    const cleanupUser = vi.fn().mockResolvedValue(undefined);
    const signOut = vi.fn()
      .mockRejectedValueOnce({ code: 'auth/network' })
      .mockResolvedValueOnce(undefined);
    const auth = authPort({
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-cleanup' }),
      signOut,
    });
    render(
      <AuthGate auth={auth} onSignedOut={cleanupUser}>
        {(user) => <h1>{user.userId}</h1>}
      </AuthGate>,
    );

    await userEvent.click(await screen.findByRole('button', { name: '退出登录' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(cleanupUser).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: '退出登录' }));
    expect(await screen.findByLabelText('邮箱')).toBeInTheDocument();
    expect(cleanupUser).toHaveBeenCalledWith({ userId: 'user-cleanup' });
  });

  it('shows the logged-out UI before local cleanup settles', async () => {
    const cleanup = deferred<void>();
    const auth = authPort({
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-cleanup' }),
      signOut: vi.fn().mockResolvedValue(undefined),
    });
    render(
      <AuthGate auth={auth} onSignedOut={() => cleanup.promise}>
        <h1>protected</h1>
      </AuthGate>,
    );

    await userEvent.click(await screen.findByRole('button', { name: '退出登录' }));

    expect(await screen.findByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'protected' })).not.toBeInTheDocument();
  });

  it('reports local cleanup failure safely and retries without restoring the session', async () => {
    const cleanupUser = vi.fn()
      .mockRejectedValueOnce(new Error('private user-cleanup detail'))
      .mockResolvedValueOnce(undefined);
    const auth = authPort({
      currentUser: vi.fn().mockResolvedValue({ userId: 'sensitive-user-id' }),
      signOut: vi.fn().mockResolvedValue(undefined),
    });
    render(
      <AuthGate auth={auth} onSignedOut={cleanupUser}>
        <h1>protected</h1>
      </AuthGate>,
    );

    await userEvent.click(await screen.findByRole('button', { name: '退出登录' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('已退出，但本机草稿清理失败');
    expect(document.body.textContent).not.toContain('sensitive-user-id');
    expect(document.body.textContent).not.toContain('private user-cleanup detail');

    await userEvent.click(screen.getByRole('button', { name: '重试清理本机草稿' }));

    expect(cleanupUser).toHaveBeenCalledTimes(2);
    expect(await screen.findByLabelText('邮箱')).toBeInTheDocument();
    expect(screen.queryByText(/本机草稿清理失败/)).not.toBeInTheDocument();
    expect(auth.currentUser).toHaveBeenCalledTimes(1);
  });

  it('does not let an older never-settling cleanup block a later account cleanup', async () => {
    const firstCleanup = deferred<void>();
    const cleanupUser = vi.fn()
      .mockImplementationOnce(() => firstCleanup.promise)
      .mockResolvedValueOnce(undefined);
    const auth = authPort({
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-a' }),
      verifyEmailCode: vi.fn().mockResolvedValue({ userId: 'user-b' }),
      signOut: vi.fn().mockResolvedValue(undefined),
    });
    const user = userEvent.setup();
    render(<AuthGate auth={auth} onSignedOut={cleanupUser}><h1>protected</h1></AuthGate>);

    await user.click(await screen.findByRole('button', { name: '退出登录' }));
    await user.type(await screen.findByLabelText('邮箱'), 'user-b@example.test');
    await user.click(screen.getByRole('button', { name: '获取验证码' }));
    await user.type(await screen.findByLabelText('六位验证码'), '123456');
    await user.click(screen.getByRole('button', { name: '注册或登录' }));
    await user.click(await screen.findByRole('button', { name: '退出登录' }));

    expect(await screen.findByLabelText('邮箱')).toBeInTheDocument();
    expect(cleanupUser).toHaveBeenCalledTimes(2);
    expect(cleanupUser).toHaveBeenLastCalledWith({ userId: 'user-b' });
  });

  it('restores only once per auth instance in StrictMode', async () => {
    const auth = authPort({ currentUser: vi.fn().mockResolvedValue(null) });
    render(
      <StrictMode>
        <AuthGate auth={auth}><h1>protected</h1></AuthGate>
      </StrictMode>,
    );

    expect(await screen.findByLabelText('邮箱')).toBeInTheDocument();
    expect(auth.currentUser).toHaveBeenCalledTimes(1);
  });

  it('immediately hides the old user and restores exactly once when auth changes', async () => {
    const nextSession = deferred<{ userId: string } | null>();
    const authA = authPort({ currentUser: vi.fn().mockResolvedValue({ userId: 'user-a' }) });
    const authB = authPort({ currentUser: vi.fn(() => nextSession.promise) as AuthPort['currentUser'] });
    const { rerender } = render(<AuthGate auth={authA}><h1>protected</h1></AuthGate>);
    expect(await screen.findByRole('heading', { name: 'protected' })).toBeInTheDocument();

    rerender(<AuthGate auth={authB}><h1>protected</h1></AuthGate>);
    expect(screen.getByRole('status')).toHaveTextContent('正在恢复登录状态…');
    expect(screen.queryByRole('heading', { name: 'protected' })).not.toBeInTheDocument();
    expect(authB.currentUser).toHaveBeenCalledTimes(1);

    await act(async () => nextSession.resolve(null));
    expect(await screen.findByLabelText('邮箱')).toBeInTheDocument();
    expect(authA.currentUser).toHaveBeenCalledTimes(1);
    expect(authB.currentUser).toHaveBeenCalledTimes(1);
  });

  it('ignores a pending restore from an old auth instance', async () => {
    const oldSession = deferred<{ userId: string } | null>();
    const authA = authPort({ currentUser: vi.fn(() => oldSession.promise) as AuthPort['currentUser'] });
    const authB = authPort({ currentUser: vi.fn().mockResolvedValue({ userId: 'user-b' }) });
    const { rerender } = render(<AuthGate auth={authA}><h1>protected</h1></AuthGate>);

    rerender(<AuthGate auth={authB}><h1>protected</h1></AuthGate>);
    expect(await screen.findByRole('heading', { name: 'protected' })).toBeInTheDocument();
    await act(async () => oldSession.resolve(null));

    expect(screen.getByRole('heading', { name: 'protected' })).toBeInTheDocument();
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();
  });

  it('shows onboarding after OTP verification succeeds', async () => {
    const auth = authPort({});
    const user = userEvent.setup();
    render(<AuthGate auth={auth}><h1>设置你的增肌目标</h1></AuthGate>);

    await user.type(await screen.findByLabelText('邮箱'), 'user@example.com');
    await user.click(screen.getByRole('button', { name: '获取验证码' }));
    await user.type(await screen.findByLabelText('六位验证码'), '123456');
    await user.click(screen.getByRole('button', { name: '注册或登录' }));

    expect(await screen.findByRole('heading', { name: '设置你的增肌目标' })).toBeInTheDocument();
  });

  it('keeps the session after sign-out failure and allows retry', async () => {
    const firstSignOut = deferred<void>();
    const signOut = vi.fn()
      .mockImplementationOnce(() => firstSignOut.promise)
      .mockResolvedValueOnce(undefined);
    const auth = authPort({
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      signOut,
    });
    render(<AuthGate auth={auth}><h1>设置你的增肌目标</h1></AuthGate>);

    const button = await screen.findByRole('button', { name: '退出登录' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(signOut).toHaveBeenCalledTimes(1);
    firstSignOut.reject({ code: 'auth/network', message: 'raw provider error' });

    expect(await screen.findByText('网络连接失败，请检查网络后重试。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '设置你的增肌目标' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '退出登录' }));

    expect(signOut).toHaveBeenCalledTimes(2);
    expect(await screen.findByLabelText('邮箱')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('raw provider error');
  });

  it('ignores sign-out completion from an old auth instance', async () => {
    const signOut = deferred<void>();
    const authA = authPort({
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-a' }),
      signOut: vi.fn(() => signOut.promise),
    });
    const authB = authPort({ currentUser: vi.fn().mockResolvedValue({ userId: 'user-b' }) });
    const { rerender } = render(<AuthGate auth={authA}><h1>protected</h1></AuthGate>);

    fireEvent.click(await screen.findByRole('button', { name: '退出登录' }));
    rerender(<AuthGate auth={authB}><h1>protected</h1></AuthGate>);
    await screen.findByRole('heading', { name: 'protected' });
    await act(async () => signOut.resolve());

    expect(screen.getByRole('heading', { name: 'protected' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '退出登录' })).toBeEnabled();
  });
});
