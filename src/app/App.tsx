import { useEffect, useMemo, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { AuthGate } from '../features/auth';
import { OnboardingPage } from '../features/onboarding';
import type { AuthPort } from '../platform/auth';
import type { ProfileSettingsRepository } from '../platform/settings/ProfileSettingsRepository';
import { readCloudBasePublicConfig } from '../platform/cloudbase/cloudBaseConfig';
import type { CloudBasePublicConfig } from '../platform/cloudbase/cloudBaseConfig';
import {
  BrowserDraftSettingsRepository,
  type SettingsRepository,
} from '../platform/settings';
import { safeLocalStorage } from '../platform/storage/safeLocalStorage';
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

function PlaceholderPage({ title }: { title: string }) {
  return (
    <main className="page">
      <h1>{title}</h1>
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
  cloudBaseEnv?: Readonly<Record<string, string | boolean | undefined>>;
  platformLoader?: PlatformLoader;
}

type Platform = { auth: AuthPort; profileSettings: ProfileSettingsRepository };
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

export function App({
  auth: injectedAuth,
  profileSettings: injectedProfileSettings,
  cloudBaseEnv = import.meta.env,
  platformLoader = defaultPlatformLoader,
}: AppProps = {}) {
  const testPlatformRequested = import.meta.env.MODE === 'test'
    && new URLSearchParams(window.location.search).get('test-platform') === '1';
  const selectedPlatformLoader = useMemo<PlatformLoader>(() => {
    if (!testPlatformRequested) return platformLoader;
    return async () => {
      const { createTestPlatform } = await import('../platform/testing/createTestPlatform');
      return createTestPlatform();
    };
  }, [platformLoader, testPlatformRequested]);
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
  }>(() => ({
    config: publicConfig,
    status: publicConfig === null ? 'idle' : 'loading',
    auth: null,
    profileSettings: null,
  }));
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    if (injectedAuth !== undefined || publicConfig === null) return;

    setPlatformState({ config: publicConfig, status: 'loading', auth: null, profileSettings: null });
    void selectedPlatformLoader(publicConfig)
      .then((platform) => {
        if (active) setPlatformState({
          config: publicConfig,
          status: 'ready',
          auth: platform.auth,
          profileSettings: platform.profileSettings,
        });
      })
      .catch(() => {
        if (active) setPlatformState({ config: publicConfig, status: 'error', auth: null, profileSettings: null });
      });
    return () => {
      active = false;
    };
  }, [injectedAuth, loadAttempt, publicConfig, selectedPlatformLoader]);

  const currentPlatformState = platformState.config === publicConfig
    ? platformState
    : { config: publicConfig, status: 'loading' as const, auth: null, profileSettings: null };
  const auth = injectedAuth ?? currentPlatformState.auth;
  const profileSettings = injectedProfileSettings ?? currentPlatformState.profileSettings;
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
        <Route path="/today" element={<PlaceholderPage title="今日记录" />} />
        <Route path="*" element={<WelcomePage />} />
      </Routes>
      <PwaUpdatePrompt />
    </>
  );
}
