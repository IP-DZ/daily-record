import cloudbaseModule from '@cloudbase/js-sdk';

import { CloudBaseAuthAdapter } from './CloudBaseAuthAdapter';
import type { CloudBaseAuthClient } from './CloudBaseAuthAdapter';
import type { CloudBasePublicConfig } from './cloudBaseConfig';
import {
  CloudBaseProfileSettingsRepository,
  type CloudBaseRdbClient,
} from './CloudBaseProfileSettingsRepository';
import {
  CloudBaseMealsRepository,
  type CloudBaseMealsRdbClient,
} from './CloudBaseMealsRepository';
import {
  CloudBaseWeightRepository,
  type CloudBaseWeightRdbClient,
} from './CloudBaseWeightRepository';
import {
  CloudBaseWorkoutsRepository,
  type CloudBaseWorkoutsRdbClient,
} from './CloudBaseWorkoutsRepository';

interface CloudBaseApp {
  auth: CloudBaseAuthClient;
  rdb(): CloudBaseRdbClient
    & CloudBaseMealsRdbClient
    & CloudBaseWeightRdbClient
    & CloudBaseWorkoutsRdbClient;
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
  meals: CloudBaseMealsRepository;
  weight: CloudBaseWeightRepository;
  workouts: CloudBaseWorkoutsRepository;
} {
  const cloudbase = cloudbaseModule as unknown as CloudBaseSdk;
  const app = cloudbase.init({
    env: config.envId,
    region: config.region,
    accessKey: config.publishableKey,
    timeout: 15_000,
  });
  const rdb = app.rdb();

  const platform = {
    auth: new CloudBaseAuthAdapter(app.auth),
    profileSettings: new CloudBaseProfileSettingsRepository(rdb),
  } as {
    auth: CloudBaseAuthAdapter;
    profileSettings: CloudBaseProfileSettingsRepository;
    meals: CloudBaseMealsRepository;
    weight: CloudBaseWeightRepository;
    workouts: CloudBaseWorkoutsRepository;
  };
  Object.defineProperty(platform, 'meals', {
    value: new CloudBaseMealsRepository(rdb),
    enumerable: false,
  });
  Object.defineProperty(platform, 'weight', {
    value: new CloudBaseWeightRepository(rdb),
    enumerable: false,
  });
  Object.defineProperty(platform, 'workouts', {
    value: new CloudBaseWorkoutsRepository(rdb),
    enumerable: false,
  });
  return platform;
}
