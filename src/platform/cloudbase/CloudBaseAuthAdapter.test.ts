import { describe, expect, it, vi } from 'vitest';

import { CloudBaseAuthAdapter } from './CloudBaseAuthAdapter';

function createAuth(overrides: Record<string, unknown> = {}) {
  return {
    signInWithOtp: vi.fn(),
    getSession: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
}

describe('CloudBaseAuthAdapter', () => {
  it('规范化邮箱并请求可创建账号的验证码', async () => {
    const verifyOtp = vi.fn();
    const auth = createAuth({
      signInWithOtp: vi.fn().mockResolvedValue({ data: { verifyOtp } }),
    });
    const adapter = new CloudBaseAuthAdapter(auth);

    await adapter.requestEmailCode(' USER@Example.com ');

    expect(auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      options: { shouldCreateUser: true },
    });
  });

  it('按规范化邮箱使用对应的一次性验证回调', async () => {
    const aliceVerify = vi.fn().mockResolvedValue({
      data: { user: { id: 'alice-id' } },
    });
    const bobVerify = vi.fn().mockResolvedValue({
      data: { user: { id: 'bob-id' } },
    });
    const auth = createAuth({
      signInWithOtp: vi
        .fn()
        .mockResolvedValueOnce({ data: { verifyOtp: aliceVerify } })
        .mockResolvedValueOnce({ data: { verifyOtp: bobVerify } }),
    });
    const adapter = new CloudBaseAuthAdapter(auth);

    await adapter.requestEmailCode('Alice@Example.com');
    await adapter.requestEmailCode(' BOB@example.com ');

    await expect(
      adapter.verifyEmailCode(' alice@example.com ', '123456'),
    ).resolves.toEqual({ userId: 'alice-id' });
    expect(aliceVerify).toHaveBeenCalledWith({ token: '123456' });
    expect(bobVerify).not.toHaveBeenCalled();
  });

  it('未请求验证码时返回 code-required', async () => {
    const adapter = new CloudBaseAuthAdapter(createAuth());

    await expect(
      adapter.verifyEmailCode('user@example.com', '123456'),
    ).rejects.toMatchObject({ code: 'auth/code-required' });
  });

  it('请求前拒绝非法邮箱', async () => {
    const auth = createAuth();
    const adapter = new CloudBaseAuthAdapter(auth);

    await expect(adapter.requestEmailCode('not-an-email')).rejects.toMatchObject({
      code: 'auth/invalid-email',
    });
    expect(auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it('验证前拒绝非六位数字验证码', async () => {
    const auth = createAuth();
    const adapter = new CloudBaseAuthAdapter(auth);

    await expect(
      adapter.verifyEmailCode('user@example.com', '12345'),
    ).rejects.toMatchObject({ code: 'auth/code-required' });
  });

  it('请求响应缺少验证回调时返回 session 错误', async () => {
    const adapter = new CloudBaseAuthAdapter(
      createAuth({ signInWithOtp: vi.fn().mockResolvedValue({ data: {} }) }),
    );

    await expect(
      adapter.requestEmailCode('user@example.com'),
    ).rejects.toMatchObject({ code: 'auth/session' });
  });

  it.each([
    ['invalid_email', 'auth/invalid-email'],
    ['captcha_required', 'auth/captcha-required'],
    ['too_many_requests', 'auth/rate-limited'],
  ])('在请求验证码阶段将 CloudBase 错误 %s 转换为 %s', async (cloudCode, stableCode) => {
    const adapter = new CloudBaseAuthAdapter(
      createAuth({
        signInWithOtp: vi.fn().mockResolvedValue({
          error: { code: cloudCode, message: 'sensitive provider detail' },
        }),
      }),
    );

    await expect(
      adapter.requestEmailCode('user@example.com'),
    ).rejects.toMatchObject({
      code: stableCode,
      message: expect.not.stringContaining('sensitive provider detail'),
    });
  });

  it.each([
    [
      'errorCode 8',
      { errorCode: 8, status: 'resource_exhausted', category: 'RATE_LIMITED' },
      'auth/rate-limited',
    ],
    [
      '字符串网络状态',
      { status: 'unreachable', category: 'SERVICE_ERROR' },
      'auth/network',
    ],
    [
      'SDK 网络分类',
      { status: 'deadline_exceeded', category: 'SERVICE_ERROR' },
      'auth/network',
    ],
    [
      '服务内部错误',
      { errorCode: 13, status: 'internal', category: 'SERVICE_ERROR' },
      'auth/unknown',
    ],
  ])(
    '识别 CloudBase 3.6.2 AuthError 形状：%s',
    async (_label, providerError, stableCode) => {
      const adapter = new CloudBaseAuthAdapter(
        createAuth({
          signInWithOtp: vi.fn().mockResolvedValue({
            error: {
              ...providerError,
              code: 'provider-generated-code',
              message: 'user@example.com token=123456 provider detail',
            },
          }),
        }),
      );

      await expect(
        adapter.requestEmailCode('user@example.com'),
      ).rejects.toMatchObject({
        code: stableCode,
        message: expect.not.stringContaining('user@example.com'),
      });
    },
  );

  it('将网络异常转换为稳定网络错误且不暴露原始信息', async () => {
    const adapter = new CloudBaseAuthAdapter(
      createAuth({
        signInWithOtp: vi
          .fn()
          .mockRejectedValue(new TypeError('user@example.com token=123456')),
      }),
    );

    await expect(
      adapter.requestEmailCode('user@example.com'),
    ).rejects.toMatchObject({
      code: 'auth/network',
      message: expect.not.stringContaining('user@example.com'),
    });
  });

  it('网络失败后保留验证回调以便重试', async () => {
    const verifyOtp = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({
        data: { user: { id: 'user-id' } },
      });
    const adapter = new CloudBaseAuthAdapter(
      createAuth({
        signInWithOtp: vi.fn().mockResolvedValue({ data: { verifyOtp } }),
      }),
    );
    await adapter.requestEmailCode('user@example.com');

    await expect(
      adapter.verifyEmailCode('user@example.com', '123456'),
    ).rejects.toMatchObject({ code: 'auth/network' });
    await expect(
      adapter.verifyEmailCode('user@example.com', '123456'),
    ).resolves.toEqual({ userId: 'user-id' });
  });

  it('验证成功后删除一次性回调', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-id' } },
    });
    const adapter = new CloudBaseAuthAdapter(
      createAuth({
        signInWithOtp: vi.fn().mockResolvedValue({ data: { verifyOtp } }),
      }),
    );
    await adapter.requestEmailCode('user@example.com');
    await adapter.verifyEmailCode('user@example.com', '123456');

    await expect(
      adapter.verifyEmailCode('user@example.com', '123456'),
    ).rejects.toMatchObject({ code: 'auth/code-required' });
  });

  it('验证码过期后删除不可重试的回调', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      error: { code: 'otp_expired', message: 'expired' },
    });
    const adapter = new CloudBaseAuthAdapter(
      createAuth({
        signInWithOtp: vi.fn().mockResolvedValue({ data: { verifyOtp } }),
      }),
    );
    await adapter.requestEmailCode('user@example.com');

    await expect(
      adapter.verifyEmailCode('user@example.com', '123456'),
    ).rejects.toMatchObject({ code: 'auth/code-expired' });
    await expect(
      adapter.verifyEmailCode('user@example.com', '123456'),
    ).rejects.toMatchObject({ code: 'auth/code-required' });
  });

  it('用 3.6.2 VERIFICATION_FAILED 形状识别过期并删除回调', async () => {
    const verifyOtp = vi.fn().mockResolvedValue({
      error: {
        code: 'invalid_argument',
        errorCode: 3,
        status: 'invalid_argument',
        category: 'VERIFICATION_FAILED',
        message: 'verification token expired for user@example.com',
      },
    });
    const adapter = new CloudBaseAuthAdapter(
      createAuth({
        signInWithOtp: vi.fn().mockResolvedValue({ data: { verifyOtp } }),
      }),
    );
    await adapter.requestEmailCode('user@example.com');

    await expect(
      adapter.verifyEmailCode('user@example.com', '123456'),
    ).rejects.toMatchObject({
      code: 'auth/code-expired',
      message: expect.not.stringContaining('user@example.com'),
    });
    await expect(
      adapter.verifyEmailCode('user@example.com', '123456'),
    ).rejects.toMatchObject({ code: 'auth/code-required' });
  });

  it.each([
    {
      label: 'VERIFICATION_FAILED',
      error: {
        errorCode: 3,
        status: 'invalid_argument',
        category: 'VERIFICATION_FAILED',
        message: 'verification code does not match token=123456',
      },
      stableCode: 'auth/code-invalid',
    },
    {
      label: 'INVALID_CREDENTIALS',
      error: {
        status: 'invalid_verification_code',
        category: 'INVALID_CREDENTIALS',
        message: 'invalid verification code token=123456',
      },
      stableCode: 'auth/code-invalid',
    },
    {
      label: 'RATE_LIMITED',
      error: {
        errorCode: 8,
        status: 'resource_exhausted',
        category: 'RATE_LIMITED',
        message: 'rate limit user@example.com',
      },
      stableCode: 'auth/rate-limited',
    },
    {
      label: 'SERVICE_ERROR',
      error: {
        errorCode: 14,
        status: 'unavailable',
        category: 'SERVICE_ERROR',
        message: 'service unavailable user@example.com',
      },
      stableCode: 'auth/unknown',
    },
  ])('验证失败 $label 可重试并保留回调', async ({ error, stableCode }) => {
    const verifyOtp = vi
      .fn()
      .mockResolvedValueOnce({ error })
      .mockResolvedValueOnce({ data: { user: { id: 'user-id' } } });
    const adapter = new CloudBaseAuthAdapter(
      createAuth({
        signInWithOtp: vi.fn().mockResolvedValue({ data: { verifyOtp } }),
      }),
    );
    await adapter.requestEmailCode('user@example.com');

    await expect(
      adapter.verifyEmailCode('user@example.com', '123456'),
    ).rejects.toMatchObject({
      code: stableCode,
      message: expect.not.stringContaining('123456'),
    });
    await expect(
      adapter.verifyEmailCode('user@example.com', '123456'),
    ).resolves.toEqual({ userId: 'user-id' });
  });

  it('会话缺少用户 ID 时返回 session 错误', async () => {
    const adapter = new CloudBaseAuthAdapter(
      createAuth({
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: {} } },
        }),
      }),
    );

    await expect(adapter.currentUser()).rejects.toMatchObject({
      code: 'auth/session',
    });
  });

  it('没有会话时返回 null', async () => {
    const adapter = new CloudBaseAuthAdapter(
      createAuth({
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      }),
    );

    await expect(adapter.currentUser()).resolves.toBeNull();
  });

  it.each([
    {
      label: 'CloudBase 3.6.2 未认证会话',
      error: {
        errorCode: 16,
        status: 'unauthenticated',
        category: 'INVALID_CREDENTIALS',
        message: 'session rejected for user@example.com token=123456',
      },
    },
    {
      label: '访问令牌过期',
      error: {
        code: 'token_expired',
        errorCode: 16,
        status: 'unauthenticated',
        category: 'INVALID_CREDENTIALS',
        message: 'access token expired for user@example.com',
      },
    },
  ])('将 $label 映射为 session 错误而不是验证码错误', async ({ error }) => {
    const adapter = new CloudBaseAuthAdapter(
      createAuth({
        getSession: vi.fn().mockResolvedValue({ error }),
      }),
    );

    await expect(adapter.currentUser()).rejects.toMatchObject({
      code: 'auth/session',
      message: expect.not.stringContaining('user@example.com'),
    });
  });

  it('请求验证码阶段的 token-expired 提示不会伪装成验证码过期', async () => {
    const adapter = new CloudBaseAuthAdapter(
      createAuth({
        signInWithOtp: vi.fn().mockResolvedValue({
          error: {
            code: 'token_expired',
            errorCode: 16,
            status: 'unauthenticated',
            category: 'INVALID_CREDENTIALS',
            message: 'access token expired for user@example.com',
          },
        }),
      }),
    );

    await expect(
      adapter.requestEmailCode('user@example.com'),
    ).rejects.toMatchObject({
      code: 'auth/unknown',
      message: expect.not.stringContaining('user@example.com'),
    });
  });

  it('退出阶段的过期凭据映射为 session 错误而不是验证码错误', async () => {
    const adapter = new CloudBaseAuthAdapter(
      createAuth({
        signOut: vi.fn().mockResolvedValue({
          error: {
            code: 'token_expired',
            errorCode: 16,
            status: 'unauthenticated',
            category: 'INVALID_CREDENTIALS',
            message: 'access token expired for user@example.com',
          },
        }),
      }),
    );

    await expect(adapter.signOut()).rejects.toMatchObject({
      code: 'auth/session',
      message: expect.not.stringContaining('user@example.com'),
    });
  });

  it('退出失败时返回稳定错误', async () => {
    const adapter = new CloudBaseAuthAdapter(
      createAuth({
        signOut: vi.fn().mockResolvedValue({
          error: { code: 'provider_error', message: 'sensitive detail' },
        }),
      }),
    );

    await expect(adapter.signOut()).rejects.toMatchObject({
      code: 'auth/unknown',
      message: expect.not.stringContaining('sensitive detail'),
    });
  });
});
