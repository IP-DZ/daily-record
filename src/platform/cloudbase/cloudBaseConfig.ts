import { CloudBaseAuthError } from './CloudBaseAuthAdapter';

export type CloudBaseRegion = 'ap-shanghai' | 'ap-guangzhou';

export interface CloudBasePublicConfig {
  envId: string;
  region: CloudBaseRegion;
  publishableKey: string;
}

type PublicEnvironment = Readonly<Record<string, string | boolean | undefined>>;

function requirePublicValue(
  value: string | boolean | undefined,
  label: string,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new CloudBaseAuthError(
      'auth/configuration',
      `CloudBase ${label}尚未配置。`,
    );
  }
  return value.trim();
}

export function readCloudBasePublicConfig(
  env: PublicEnvironment,
): CloudBasePublicConfig {
  const envId = requirePublicValue(env.VITE_CLOUDBASE_ENV_ID, '环境 ID');
  const publishableKey = requirePublicValue(
    env.VITE_CLOUDBASE_PUBLISHABLE_KEY,
    'Publishable Key',
  );
  const region = env.VITE_CLOUDBASE_REGION ?? 'ap-shanghai';

  if (region !== 'ap-shanghai' && region !== 'ap-guangzhou') {
    throw new CloudBaseAuthError(
      'auth/configuration',
      'CloudBase 地域配置无效。',
    );
  }

  return { envId, region, publishableKey };
}
