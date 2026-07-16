import type {
  FetchLike,
  MealPhotoAnalysisCloudFunctionDependencies,
  MealPhotoAnalysisCloudFunctionEvent,
  ObjectStorageUploadFileClient,
  PhotoMealAnalysisRdbClient,
} from './runtime';

import { createMealPhotoAnalysisCloudFunction } from './runtime';

export {
  createMealPhotoAnalysisHandler,
  MealPhotoAnalysisHandlerError,
  type MealPhotoAnalysisAction,
  type MealPhotoAnalysisDatabaseGateway,
  type MealPhotoAnalysisHandlerDependencies,
  type MealPhotoAnalysisHandlerEvent,
  type MealPhotoAnalysisLogger,
  type MealPhotoAnalysisModelClient,
  type MealPhotoAnalysisStorage,
} from './handler';

export {
  createHttpJsonMealPhotoAnalysisModelClient,
  createMealPhotoAnalysisCloudFunction,
  createObjectStorageMealPhotoStorage,
  createRpcMealPhotoAnalysisDatabaseGateway,
  loadMealPhotoRuntimeConfig,
  type FetchLike,
  type HttpJsonMealPhotoModelConfig,
  type MealPhotoAnalysisCloudFunctionDependencies,
  type MealPhotoAnalysisCloudFunctionEvent,
  type MealPhotoRuntimeConfig,
  type ObjectStorageUploadFileClient,
  type PhotoMealAnalysisRdbClient,
} from './runtime';

type RuntimeEnv = Record<string, string | undefined>;

export interface CloudBaseMealPhotoRuntimeApp extends ObjectStorageUploadFileClient {
  rdb(): PhotoMealAnalysisRdbClient;
}

export interface CloudBaseMealPhotoRuntimeSdk {
  SYMBOL_CURRENT_ENV?: string | symbol;
  init(config: {
    env: string | symbol;
    accessKey: string;
    region: string;
    timeout: number;
  }): CloudBaseMealPhotoRuntimeApp;
}

export interface CloudBaseMealPhotoRuntimeDependencyOptions {
  cloudbase: CloudBaseMealPhotoRuntimeSdk;
  env?: RuntimeEnv;
  fetch?: FetchLike;
  logger?: MealPhotoAnalysisCloudFunctionDependencies['logger'];
}

function readProcessEnv(): RuntimeEnv {
  if (typeof process === 'undefined') return {};
  return process.env;
}

function requireRuntimeString(value: string | undefined, label: string): string {
  if (value == null || value.trim() === '') {
    throw new Error(`Invalid meal photo CloudBase runtime config: ${label}`);
  }
  return value.trim();
}

function resolveCloudBaseEnv(
  cloudbase: CloudBaseMealPhotoRuntimeSdk,
  env: RuntimeEnv,
): string | symbol {
  return env.CLOUDBASE_ENV_ID
    ?? env.VITE_CLOUDBASE_ENV_ID
    ?? cloudbase.SYMBOL_CURRENT_ENV
    ?? requireRuntimeString(undefined, 'CLOUDBASE_ENV_ID');
}

function resolveFetch(fetchImpl: FetchLike | undefined): FetchLike {
  if (fetchImpl != null) return fetchImpl;
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('Invalid meal photo CloudBase runtime config: fetch');
  }
  return (url, init) => globalThis.fetch(url, init);
}

export function createCloudBaseMealPhotoRuntimeDependencies(
  options: CloudBaseMealPhotoRuntimeDependencyOptions,
): MealPhotoAnalysisCloudFunctionDependencies {
  const env = options.env ?? readProcessEnv();
  const app = options.cloudbase.init({
    env: resolveCloudBaseEnv(options.cloudbase, env),
    accessKey: requireRuntimeString(
      env.CLOUDBASE_PUBLISHABLE_KEY ?? env.VITE_CLOUDBASE_PUBLISHABLE_KEY,
      'CLOUDBASE_PUBLISHABLE_KEY',
    ),
    region: env.CLOUDBASE_REGION ?? env.VITE_CLOUDBASE_REGION ?? 'ap-shanghai',
    timeout: 30_000,
  });
  return {
    env,
    fetch: resolveFetch(options.fetch),
    storage: app,
    rdb: app.rdb(),
    logger: options.logger,
  };
}

let cachedMain: ((event: MealPhotoAnalysisCloudFunctionEvent) => Promise<unknown>) | null = null;

async function loadCloudBaseSdk(): Promise<CloudBaseMealPhotoRuntimeSdk> {
  const cloudbaseModule = await import('@cloudbase/js-sdk');
  return cloudbaseModule as unknown as CloudBaseMealPhotoRuntimeSdk;
}

export async function main(event: MealPhotoAnalysisCloudFunctionEvent): Promise<unknown> {
  cachedMain ??= createMealPhotoAnalysisCloudFunction(
    createCloudBaseMealPhotoRuntimeDependencies({
      cloudbase: await loadCloudBaseSdk(),
    }),
  );
  return cachedMain(event);
}

export default main;
