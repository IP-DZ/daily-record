import { useMemo } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { OnboardingPage } from '../features/onboarding';
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

export function App() {
  const settings = useMemo(() => {
    const storage = safeLocalStorage();
    if (storage === null) {
      return { repository: unavailableSettingsRepository, storageUnavailable: true };
    }

    return {
      repository: new BrowserDraftSettingsRepository(storage, () => new Date()),
      storageUnavailable: false,
    };
  }, []);

  const onboardingPage = (
    <>
      {settings.storageUnavailable && (
        <p className="storage-unavailable-notice" role="status">
          本地存储暂不可用，仍可填写和预览；恢复浏览器存储权限后可再次保存。
        </p>
      )}
      <OnboardingPage repository={settings.repository} />
    </>
  );

  return (
    <>
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
