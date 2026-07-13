import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const promptStyle = {
  position: 'fixed',
  right: '16px',
  bottom: '16px',
  left: '16px',
  zIndex: 10,
  maxWidth: '520px',
  margin: '0 auto',
  padding: '16px',
  border: '1px solid #a9a27f',
  borderRadius: '14px',
  background: '#fffbea',
  boxShadow: '0 8px 28px rgb(23 59 47 / 18%)',
} as const;

const actionsStyle = {
  display: 'flex',
  gap: '12px',
  marginTop: '12px',
} as const;

export function PwaUpdatePrompt() {
  const [offlineDismissed, setOfflineDismissed] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW();

  async function applyUpdate() {
    setIsUpdating(true);
    setUpdateError(false);
    try {
      await updateServiceWorker(true);
    } catch {
      setUpdateError(true);
    } finally {
      setIsUpdating(false);
    }
  }

  if (needRefresh) {
    return (
      <aside aria-live="polite" style={promptStyle}>
        <strong>发现新版本</strong>
        <p>完成当前填写后，可由你决定何时更新。</p>
        {updateError && <p role="alert">更新失败，请重试。</p>}
        <button type="button" disabled={isUpdating} onClick={() => void applyUpdate()}>
          {isUpdating ? '正在更新…' : '立即更新'}
        </button>
      </aside>
    );
  }

  if (offlineReady && !offlineDismissed) {
    return (
      <aside aria-live="polite" style={promptStyle}>
        <strong>应用已可离线使用</strong>
        <div style={actionsStyle}>
          <button
            type="button"
            aria-label="关闭离线提示"
            onClick={() => setOfflineDismissed(true)}
          >
            关闭
          </button>
        </div>
      </aside>
    );
  }

  return null;
}
