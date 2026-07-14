import { describe, expect, it } from 'vitest';

import { readCloudBasePublicConfig } from './cloudBaseConfig';

describe('readCloudBasePublicConfig', () => {
  it.each([
    [{ VITE_CLOUDBASE_PUBLISHABLE_KEY: 'public-key' }, '环境 ID'],
    [{ VITE_CLOUDBASE_ENV_ID: 'environment-id' }, 'Publishable Key'],
  ])('缺少公开配置时返回稳定配置错误', (env, safeMessage) => {
    expect(() => readCloudBasePublicConfig(env)).toThrowError(
      expect.objectContaining({
        code: 'auth/configuration',
        message: expect.stringContaining(safeMessage),
      }),
    );
  });

  it.each(['ap-beijing', '', 'ap-shanghai '])(
    '拒绝不受支持的地域 %s',
    (region) => {
      expect(() =>
        readCloudBasePublicConfig({
          VITE_CLOUDBASE_ENV_ID: 'environment-id',
          VITE_CLOUDBASE_PUBLISHABLE_KEY: 'public-key',
          VITE_CLOUDBASE_REGION: region,
        }),
      ).toThrowError(expect.objectContaining({ code: 'auth/configuration' }));
    },
  );

  it.each(['ap-shanghai', 'ap-guangzhou'] as const)(
    '接受公开配置地域 %s',
    (region) => {
      expect(
        readCloudBasePublicConfig({
          VITE_CLOUDBASE_ENV_ID: ' environment-id ',
          VITE_CLOUDBASE_PUBLISHABLE_KEY: ' public-key ',
          VITE_CLOUDBASE_REGION: region,
          TENCENTCLOUD_SECRET_KEY: 'must-not-be-read',
        }),
      ).toEqual({
        envId: 'environment-id',
        publishableKey: 'public-key',
        region,
      });
    },
  );

  it('地域未配置时默认使用 ap-shanghai', () => {
    expect(
      readCloudBasePublicConfig({
        VITE_CLOUDBASE_ENV_ID: 'environment-id',
        VITE_CLOUDBASE_PUBLISHABLE_KEY: 'public-key',
      }),
    ).toEqual({
      envId: 'environment-id',
      publishableKey: 'public-key',
      region: 'ap-shanghai',
    });
  });
});
