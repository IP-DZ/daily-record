import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import type { z } from 'zod';
import { AuthGate } from '../features/auth';
import { OnboardingPage } from '../features/onboarding';
import { SettingsPage } from '../features/settings';
import { TodayPage, todayMealDraftSchema } from '../features/today';
import { PhotoMealPage } from '../features/photo-meal';
import { NutritionTrendsPage } from '../features/nutrition-trends';
import { TrendsPage } from '../features/trends';
import { WeightPage, weightDraftSchema } from '../features/weight';
import { WorkoutsPage, workoutDraftSchema } from '../features/workouts';
import type { AuthPort } from '../platform/auth';
import type { MealsRepository } from '../platform/meals';
import type { NutritionGoalsRepository } from '../platform/nutritionGoals';
import type { PhotoMealAnalysisRepository } from '../platform/photoMeal';
import type { ProfileSettingsRepository } from '../platform/settings/ProfileSettingsRepository';
import type { WeightRepository } from '../platform/weight';
import type { WorkoutsRepository } from '../platform/workouts';
import { readCloudBasePublicConfig } from '../platform/cloudbase/cloudBaseConfig';
import type { CloudBasePublicConfig } from '../platform/cloudbase/cloudBaseConfig';
import {
  BrowserDraftSettingsRepository,
  type SettingsRepository,
} from '../platform/settings';
import { BrowserOfflineDraftRepository } from '../platform/offline';
import { safeLocalStorage } from '../platform/storage/safeLocalStorage';
import type { AccountRepository } from '../platform/account';
import { PwaUpdatePrompt } from './PwaUpdatePrompt';
import './styles.css';

function WelcomePage() {
  return (
    <main className="page">
      <p className="eyebrow">增肌饮食与训练</p>
      <h1>每日记录</h1>
      <p>记录饮食、训练和体重变化。</p>
      <Link className="primary-action" to="/onboarding">
        开始设置
      </Link>
    </main>
  );
}

const unavailableSettingsRepository: SettingsRepository = {
  async loadDraft() {
    return null;
  },
  async saveDraft() {
    throw new Error('Browser storage is unavailable');
  },
  async clearDraft() {},
};

interface AppProps {
  auth?: AuthPort;
  profileSettings?: ProfileSettingsRepository;
  meals?: MealsRepository;
  nutritionGoals?: NutritionGoalsRepository;
  photoMeals?: PhotoMealAnalysisRepository;
  weight?: WeightRepository;
  workouts?: WorkoutsRepository;
  account?: AccountRepository;
  cloudBaseEnv?: Readonly<Record<string, string | boolean | undefined>>;
  platformLoader?: PlatformLoader;
}

type Platform = {
  auth: AuthPort;
  profileSettings: ProfileSettingsRepository;
  meals: MealsRepository;
  nutritionGoals: NutritionGoalsRepository;
  photoMeals: PhotoMealAnalysisRepository;
  weight: WeightRepository;
  workouts: WorkoutsRepository;
  account: AccountRepository;
};
type PlatformLoader = (config: CloudBasePublicConfig) => Promise<Platform>;
const TEST_PLATFORM_CONFIG: CloudBasePublicConfig = {
  envId: 'test',
  region: 'ap-shanghai',
  publishableKey: 'test',
};

const defaultPlatformLoader: PlatformLoader = async (config) => {
  const { createCloudBasePlatform } = await import('../platform/cloudbase/createCloudBasePlatform');
  return createCloudBasePlatform(config);
};

function isTestPlatformRequested(): boolean {
  if (import.meta.env.MODE !== 'test') return false;
  return new URLSearchParams(window.location.search).get('test-platform') === '1';
}

function resolvePlatformLoader(platformLoader: PlatformLoader): PlatformLoader {
  if (!isTestPlatformRequested()) return platformLoader;

  return async () => {
    const { createTestPlatform } = await import('../platform/testing/createTestPlatform');
    return createTestPlatform();
  };
}

export function App({
  auth: injectedAuth,
  profileSettings: injectedProfileSettings,
  meals: injectedMeals,
  nutritionGoals: injectedNutritionGoals,
  photoMeals: injectedPhotoMeals,
  weight: injectedWeight,
  workouts: injectedWorkouts,
  account: injectedAccount,
  cloudBaseEnv = import.meta.env,
  platformLoader = defaultPlatformLoader,
}: AppProps = {}) {
  const testPlatformRequested = isTestPlatformRequested();
  const selectedPlatformLoader = useMemo<PlatformLoader>(() => {
    return resolvePlatformLoader(platformLoader);
  }, [platformLoader]);
  const settings = useMemo(() => {
    const storage = safeLocalStorage();
    if (storage === null) {
      return { repository: unavailableSettingsRepository, storage: null, storageUnavailable: true };
    }

    return {
      repository: new BrowserDraftSettingsRepository(storage, () => new Date()),
      storage,
      storageUnavailable: false,
    };
  }, []);
  const userRepositories = useMemo(() => new Map<string, SettingsRepository>(), [settings.storage]);
  const repositoryForUser = (userId: string) => {
    if (settings.storage === null) return unavailableSettingsRepository;
    const cached = userRepositories.get(userId);
    if (cached !== undefined) return cached;
    const repository = new BrowserDraftSettingsRepository(
      settings.storage,
      () => new Date(),
      { kind: 'user', userId },
    );
    userRepositories.set(userId, repository);
    return repository;
  };
  const offlineDraftRepositoryForUser = <TDraft,>(
    userId: string,
    pageKey: string,
    schema: z.ZodType<TDraft>,
  ) => {
    if (settings.storage === null) return undefined;
    return new BrowserOfflineDraftRepository<TDraft>(settings.storage, {
      identity: { kind: 'user', userId },
      pageKey,
      schemaVersion: 1,
      schema,
    });
  };

  const publicConfig = useMemo<CloudBasePublicConfig | null>(() => {
    if (injectedAuth !== undefined) {
      return null;
    }
    if (testPlatformRequested) {
      return TEST_PLATFORM_CONFIG;
    }
    try {
      return readCloudBasePublicConfig(cloudBaseEnv);
    } catch {
      return null;
    }
  }, [cloudBaseEnv, injectedAuth, testPlatformRequested]);
  const [platformState, setPlatformState] = useState<{
    config: CloudBasePublicConfig | null;
    status: 'idle' | 'loading' | 'ready' | 'error';
    auth: AuthPort | null;
    profileSettings: ProfileSettingsRepository | null;
    meals: MealsRepository | null;
    nutritionGoals: NutritionGoalsRepository | null;
    photoMeals: PhotoMealAnalysisRepository | null;
    weight: WeightRepository | null;
    workouts: WorkoutsRepository | null;
    account: AccountRepository | null;
  }>(() => ({
    config: publicConfig,
    status: publicConfig === null ? 'idle' : 'loading',
    auth: null,
    profileSettings: null,
    meals: null,
    nutritionGoals: null,
    photoMeals: null,
    weight: null,
    workouts: null,
    account: null,
  }));
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    if (injectedAuth !== undefined || publicConfig === null) return;

    setPlatformState({
      config: publicConfig,
      status: 'loading',
      auth: null,
      profileSettings: null,
      meals: null,
      nutritionGoals: null,
      photoMeals: null,
      weight: null,
      workouts: null,
      account: null,
    });
    void selectedPlatformLoader(publicConfig)
      .then((platform) => {
        if (active) setPlatformState({
          config: publicConfig,
          status: 'ready',
          auth: platform.auth,
          profileSettings: platform.profileSettings,
          meals: platform.meals,
          nutritionGoals: platform.nutritionGoals,
          photoMeals: platform.photoMeals,
          weight: platform.weight,
          workouts: platform.workouts,
          account: platform.account,
        });
      })
      .catch(() => {
        if (active) setPlatformState({
          config: publicConfig,
          status: 'error',
          auth: null,
          profileSettings: null,
          meals: null,
          nutritionGoals: null,
          photoMeals: null,
          weight: null,
          workouts: null,
          account: null,
        });
      });
    return () => {
      active = false;
    };
  }, [injectedAuth, loadAttempt, publicConfig, selectedPlatformLoader]);

  const currentPlatformState = platformState.config === publicConfig
    ? platformState
    : {
      config: publicConfig,
      status: 'loading' as const,
      auth: null,
      profileSettings: null,
      meals: null,
      nutritionGoals: null,
      photoMeals: null,
      weight: null,
      workouts: null,
      account: null,
    };
  const auth = injectedAuth ?? currentPlatformState.auth;
  const profileSettings = injectedProfileSettings ?? currentPlatformState.profileSettings;
  const meals = injectedMeals ?? currentPlatformState.meals;
  const nutritionGoals = injectedNutritionGoals ?? currentPlatformState.nutritionGoals;
  const photoMeals = injectedPhotoMeals ?? currentPlatformState.photoMeals;
  const weight = injectedWeight ?? currentPlatformState.weight;
  const workouts = injectedWorkouts ?? currentPlatformState.workouts;
  const account = injectedAccount ?? currentPlatformState.account;
  const configurationMissing = injectedAuth === undefined
    && !testPlatformRequested
    && publicConfig === null;

  const offlineOnboardingPage = (
    <>
      {settings.storageUnavailable && (
        <p className="storage-unavailable-notice" role="status">
          本地存储暂不可用，仍可填写和预览；恢复浏览器存储权限后可再次保存。
        </p>
      )}
      <OnboardingPage repository={settings.repository} />
    </>
  );
  const onboardingPage = auth !== null ? (
    <AuthGate
      auth={auth}
      onSignedOut={(user) => repositoryForUser(user.userId).clearDraft()}
    >
      {(user) => (
        <>
          {settings.storageUnavailable && (
            <p className="storage-unavailable-notice" role="status">
              本地存储暂不可用，仍可填写和预览；恢复浏览器存储权限后可再次保存。
            </p>
          )}
          <OnboardingPage
            key={user.userId}
            repository={repositoryForUser(user.userId)}
            profileSettings={profileSettings ?? undefined}
          />
        </>
      )}
    </AuthGate>
  ) : publicConfig !== null && currentPlatformState.status === 'error' ? (
    <main className="auth-loading">
      <p role="alert">认证服务加载失败，请稍后重试。</p>
      <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>
        重新连接
      </button>
    </main>
  ) : publicConfig !== null ? (
    <main className="auth-loading" role="status">正在连接认证服务…</main>
  ) : offlineOnboardingPage;
  const todayPage = auth !== null && meals !== null ? (
    <AuthGate auth={auth}>
      {(user) => (
        <TodayPage
          meals={meals}
          draftRepository={offlineDraftRepositoryForUser(user.userId, 'today-meal', todayMealDraftSchema)}
        />
      )}
    </AuthGate>
  ) : publicConfig !== null && currentPlatformState.status === 'error' ? (
    <main className="auth-loading">
      <p role="alert">认证服务加载失败，请稍后重试。</p>
      <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>
        重新连接
      </button>
    </main>
  ) : publicConfig !== null ? (
    <main className="auth-loading" role="status">正在连接认证服务…</main>
  ) : (
    <main className="auth-loading" role="alert">
      今日记录需要登录后使用；请先配置 CloudBase 或打开测试平台。
    </main>
  );
  const weightPage = auth !== null && weight !== null ? (
    <AuthGate auth={auth}>
      {(user) => (
        <WeightPage
          weight={weight}
          draftRepository={offlineDraftRepositoryForUser(user.userId, 'weight', weightDraftSchema)}
        />
      )}
    </AuthGate>
  ) : publicConfig !== null && currentPlatformState.status === 'error' ? (
    <main className="auth-loading">
      <p role="alert">认证服务加载失败，请稍后重试。</p>
      <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>
        重新连接
      </button>
    </main>
  ) : publicConfig !== null ? (
    <main className="auth-loading" role="status">正在连接认证服务…</main>
  ) : (
    <main className="auth-loading" role="alert">
      体重记录需要登录后使用；请先配置 CloudBase 或打开测试平台。
    </main>
  );
  const photoMealPage = auth !== null && photoMeals !== null ? (
    <AuthGate auth={auth}>
      <PhotoMealPage photoMeals={photoMeals} />
    </AuthGate>
  ) : publicConfig !== null && currentPlatformState.status === 'error' ? (
    <main className="auth-loading">
      <p role="alert">认证服务加载失败，请稍后重试。</p>
      <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>
        重新连接
      </button>
    </main>
  ) : publicConfig !== null ? (
    <main className="auth-loading" role="status">正在连接认证服务…</main>
  ) : (
    <main className="auth-loading" role="alert">
      拍照记餐需要登录后使用；请先配置 CloudBase 或打开测试平台。
    </main>
  );
  const workoutsPage = auth !== null && workouts !== null ? (
    <AuthGate auth={auth}>
      {(user) => (
        <WorkoutsPage
          workouts={workouts}
          draftRepository={offlineDraftRepositoryForUser(user.userId, 'workouts', workoutDraftSchema)}
        />
      )}
    </AuthGate>
  ) : publicConfig !== null && currentPlatformState.status === 'error' ? (
    <main className="auth-loading">
      <p role="alert">认证服务加载失败，请稍后重试。</p>
      <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>
        重新连接
      </button>
    </main>
  ) : publicConfig !== null ? (
    <main className="auth-loading" role="status">正在连接认证服务…</main>
  ) : (
    <main className="auth-loading" role="alert">
      训练记录需要登录后使用；请先配置 CloudBase 或打开测试平台。
    </main>
  );
  const nutritionTrendsPage = auth !== null && meals !== null && nutritionGoals !== null ? (
    <AuthGate auth={auth}>
      <NutritionTrendsPage meals={meals} nutritionGoals={nutritionGoals} />
    </AuthGate>
  ) : publicConfig !== null && currentPlatformState.status === 'error' ? (
    <main className="auth-loading">
      <p role="alert">认证服务加载失败，请稍后重试。</p>
      <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>
        重新连接
      </button>
    </main>
  ) : publicConfig !== null ? (
    <main className="auth-loading" role="status">正在连接认证服务…</main>
  ) : (
    <main className="auth-loading" role="alert">
      营养趋势需要登录后使用；请先配置 CloudBase 或打开测试平台。
    </main>
  );
  const trendsPage = (
    auth !== null
    && meals !== null
    && nutritionGoals !== null
    && weight !== null
    && workouts !== null
  ) ? (
    <AuthGate auth={auth}>
      <TrendsPage
        meals={meals}
        nutritionGoals={nutritionGoals}
        weight={weight}
        workouts={workouts}
      />
    </AuthGate>
  ) : publicConfig !== null && currentPlatformState.status === 'error' ? (
    <main className="auth-loading">
      <p role="alert">认证服务加载失败，请稍后重试。</p>
      <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>
        重新连接
      </button>
    </main>
  ) : publicConfig !== null ? (
    <main className="auth-loading" role="status">正在连接认证服务…</main>
  ) : (
    <main className="auth-loading" role="alert">
      综合趋势需要登录后使用；请先配置 CloudBase 或打开测试平台。
    </main>
  );
  const settingsPage = auth !== null && account !== null ? (
    <AuthGate auth={auth}>
      <SettingsPage account={account} />
    </AuthGate>
  ) : publicConfig !== null && currentPlatformState.status === 'error' ? (
    <main className="auth-loading">
      <p role="alert">认证服务加载失败，请稍后重试。</p>
      <button type="button" onClick={() => setLoadAttempt((value) => value + 1)}>
        重新连接
      </button>
    </main>
  ) : publicConfig !== null ? (
    <main className="auth-loading" role="status">正在连接认证服务…</main>
  ) : (
    <main className="auth-loading" role="alert">
      隐私设置需要登录后使用；请先配置 CloudBase 或打开测试平台。
    </main>
  );

  return (
    <>
      {configurationMissing && (
        <p className="cloudbase-configuration-notice" role="status">
          尚未配置 CloudBase 测试环境
        </p>
      )}
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/onboarding" element={onboardingPage} />
        <Route path="/today" element={todayPage} />
        <Route path="/photo-meal" element={photoMealPage} />
        <Route path="/nutrition-trends" element={nutritionTrendsPage} />
        <Route path="/trends" element={trendsPage} />
        <Route path="/settings" element={settingsPage} />
        <Route path="/weight" element={weightPage} />
        <Route path="/workouts" element={workoutsPage} />
        <Route path="*" element={<WelcomePage />} />
      </Routes>
      <PwaUpdatePrompt />
    </>
  );
}
