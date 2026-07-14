import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  auth: {
    signInWithOtp: vi.fn(),
    getSession: vi.fn(),
    signOut: vi.fn(),
  },
  init: vi.fn(),
  rdbClient: { rpc: vi.fn() },
  rdb: vi.fn(),
}));

vi.mock('@cloudbase/js-sdk', () => ({
  default: { init: sdk.init },
}));

import { CloudBaseAuthAdapter } from './CloudBaseAuthAdapter';
import { createCloudBasePlatform } from './createCloudBasePlatform';

describe('createCloudBasePlatform', () => {
  beforeEach(() => {
    sdk.init.mockReset();
    sdk.rdb.mockReset();
    sdk.rdbClient.rpc.mockReset();
    sdk.rdb.mockReturnValue(sdk.rdbClient);
    sdk.rdbClient.rpc.mockResolvedValue({ data: null, error: null });
    sdk.init.mockReturnValue({ auth: sdk.auth, rdb: sdk.rdb });
  });

  it('用固定超时和公开配置初始化真实 SDK 入口', () => {
    createCloudBasePlatform({
      envId: 'daily-record-test',
      region: 'ap-shanghai',
      publishableKey: 'public-key',
    });

    expect(sdk.init).toHaveBeenCalledWith({
      env: 'daily-record-test',
      region: 'ap-shanghai',
      accessKey: 'public-key',
      timeout: 15_000,
    });
  });

  it('调用真实 rdb() 一次，返回的资料仓库使用该 client', async () => {
    const platform = createCloudBasePlatform({
      envId: 'daily-record-test',
      region: 'ap-guangzhou',
      publishableKey: 'public-key',
    });

    expect(platform).toEqual({
      auth: expect.any(CloudBaseAuthAdapter),
      profileSettings: expect.objectContaining({ load: expect.any(Function), save: expect.any(Function) }),
    });
    expect(Object.keys(platform)).toEqual(['auth', 'profileSettings']);
    expect(platform).not.toHaveProperty('sdk');
    expect(platform).not.toHaveProperty('rdb');
    expect(sdk.rdb).toHaveBeenCalledTimes(1);

    await expect(platform.profileSettings.load()).resolves.toBeNull();
    expect(sdk.rdbClient.rpc).toHaveBeenCalledWith('load_my_profile_settings');
  });
});
