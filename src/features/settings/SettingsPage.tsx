import { useState } from 'react';

import type { AccountRepository } from '../../platform/account';
import './settings.css';

type SettingsPageProps = {
  account: AccountRepository;
};

const CONFIRMATION_PHRASE = '清空我的数据';

export function SettingsPage({ account }: SettingsPageProps) {
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function deleteApplicationData() {
    if (confirmation !== CONFIRMATION_PHRASE || isDeleting) return;

    setIsDeleting(true);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      await account.deleteMyApplicationData();
      setConfirmation('');
      setStatusMessage('应用数据已清空。你可以退出登录，或返回引导页重新设置。');
    } catch {
      setErrorMessage('清空失败，请稍后重试。');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <main className="settings-page">
      <header className="settings-header">
        <p className="settings-eyebrow">账号与隐私</p>
        <h1>隐私与设置</h1>
        <p>营养、训练和拍照估算结果都是可编辑记录，不构成医疗建议。</p>
      </header>

      <section className="settings-panel" aria-label="数据删除">
        <h2>清空应用数据</h2>
        <p>清空应用数据不会删除你的登录身份。</p>
        <p>此操作会删除当前账号在本应用中的资料、目标、餐食、体重、训练和拍照分析记录。</p>
        <label>
          确认文案
          <input
            value={confirmation}
            onChange={(event) => {
              setConfirmation(event.target.value);
              setErrorMessage(null);
              setStatusMessage(null);
            }}
            placeholder={CONFIRMATION_PHRASE}
          />
        </label>
        <button
          type="button"
          className="danger-action"
          disabled={confirmation !== CONFIRMATION_PHRASE || isDeleting}
          onClick={() => void deleteApplicationData()}
        >
          {isDeleting ? '正在清空…' : '清空我的应用数据'}
        </button>
        {statusMessage && (
          <p role="status" className="settings-message">
            {statusMessage} <a href="/onboarding">返回引导页</a>
          </p>
        )}
        {errorMessage && <p role="alert" className="settings-error">{errorMessage}</p>}
      </section>
    </main>
  );
}
