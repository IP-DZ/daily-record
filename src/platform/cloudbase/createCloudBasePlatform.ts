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
import {
  CloudBaseNutritionGoalsRepository,
  type CloudBaseNutritionGoalsRdbClient,
} from './CloudBaseNutritionGoalsRepository';
import {
  CloudBasePhotoMealAnalysisRepository,
  type CloudBasePhotoMealFunctionClient,
} from './CloudBasePhotoMealAnalysisRepository';

interface CloudBaseApp {
  auth: CloudBaseAuthClient;
  callFunction: CloudBasePhotoMealFunctionClient['callFunction'];
  rdb(): CloudBaseRdbClient
    & CloudBaseMealsRdbClient
    & CloudBaseWeightRdbClient
    & CloudBaseWorkoutsRdbClient
    & CloudBaseNutritionGoalsRdbClient;
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
  nutritionGoals: CloudBaseNutritionGoalsRepository;
  photoMeals: CloudBasePhotoMealAnalysisRepository;
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
    nutritionGoals: CloudBaseNutritionGoalsRepository;
    photoMeals: CloudBasePhotoMealAnalysisRepository;
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
  Object.defineProperty(platform, 'nutritionGoals', {
    value: new CloudBaseNutritionGoalsRepository(rdb),
    enumerable: false,
  });
  Object.defineProperty(platform, 'photoMeals', {
    value: new CloudBasePhotoMealAnalysisRepository(app),
    enumerable: false,
  });
  return platform;
}
