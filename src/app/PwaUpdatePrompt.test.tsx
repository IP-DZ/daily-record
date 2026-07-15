import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PwaUpdatePrompt } from './PwaUpdatePrompt';

const pwa = vi.hoisted(() => ({
  needRefresh: false,
  offlineReady: false,
  updateServiceWorker: vi.fn(),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [pwa.needRefresh, vi.fn()],
    offlineReady: [pwa.offlineReady, vi.fn()],
    updateServiceWorker: pwa.updateServiceWorker,
  }),
}));

afterEach(() => {
  cleanup();
  pwa.needRefresh = false;
  pwa.offlineReady = false;
  pwa.updateServiceWorker.mockReset();
});

describe('PwaUpdatePrompt', () => {
  it('waits for the user before applying an available update', async () => {
    let finishUpdate!: () => void;
    pwa.updateServiceWorker.mockReturnValue(new Promise<void>((resolve) => {
      finishUpdate = resolve;
    }));
    pwa.needRefresh = true;
    render(<PwaUpdatePrompt />);

    expect(screen.getByText('发现新版本')).toBeInTheDocument();
    expect(pwa.updateServiceWorker).not.toHaveBeenCalled();

    await userEvent.setup().click(screen.getByRole('button', { name: '立即更新' }));

    expect(pwa.updateServiceWorker).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: '正在更新…' })).toBeDisabled();

    finishUpdate();
    await screen.findByRole('button', { name: '立即更新' });
  });

  it('shows a retryable error when applying an update fails', async () => {
    pwa.needRefresh = true;
    pwa.updateServiceWorker.mockRejectedValue(new Error('update failed'));
    render(<PwaUpdatePrompt />);

    await userEvent.setup().click(screen.getByRole('button', { name: '立即更新' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('更新失败，请重试。');
    expect(screen.getByRole('button', { name: '立即更新' })).toBeEnabled();
  });

  it('allows the offline-ready message to be dismissed', async () => {
    pwa.offlineReady = true;
    render(<PwaUpdatePrompt />);

    expect(screen.getByText('应用已可离线使用')).toBeInTheDocument();
    expect(screen.getByText('已缓存静态应用外壳，不会离线缓存你的餐食照片或账号接口。')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: '关闭离线提示' }));

    expect(screen.queryByText('应用已可离线使用')).not.toBeInTheDocument();
  });
});
