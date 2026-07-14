import cloudbaseModule from '@cloudbase/js-sdk';

import { CloudBaseAuthAdapter } from './CloudBaseAuthAdapter';
import type { CloudBaseAuthClient } from './CloudBaseAuthAdapter';
import type { CloudBasePublicConfig } from './cloudBaseConfig';
import {
  CloudBaseProfileSettingsRepository,
  type CloudBaseRdbClient,
} from './CloudBaseProfileSettingsRepository';

interface CloudBaseApp {
  auth: CloudBaseAuthClient;
  rdb(): CloudBaseRdbClient;
}

interface CloudBaseSdk {
  init(config: {
    env: string;
    region: CloudBasePublicConfig['region'];
    accessKey: string;
    timeout: number;
  }): CloudBaseApp;
}

export function createCloudBasePlatform(config: CloudBasePublicConfig): {
  auth: CloudBaseAuthAdapter;
  profileSettings: CloudBaseProfileSettingsRepository;
} {
  const cloudbase = cloudbaseModule as unknown as CloudBaseSdk;
  const app = cloudbase.init({
    env: config.envId,
    region: config.region,
    accessKey: config.publishableKey,
    timeout: 15_000,
  });
  const rdb = app.rdb();

  return {
    auth: new CloudBaseAuthAdapter(app.auth),
    profileSettings: new CloudBaseProfileSettingsRepository(rdb),
  };
}
