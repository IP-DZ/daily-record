import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AccountRepository } from '../../platform/account';
import { SettingsPage } from './SettingsPage';

afterEach(cleanup);

describe('SettingsPage', () => {
  it('requires an exact confirmation phrase before clearing application data', async () => {
    const user = userEvent.setup();
    const account: AccountRepository = {
      deleteMyApplicationData: vi.fn().mockResolvedValue({ deleted: true }),
    };
    render(<SettingsPage account={account} />);

    expect(screen.getByRole('heading', { name: '隐私与设置' })).toBeInTheDocument();
    expect(screen.getByText('清空应用数据不会删除你的登录身份。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '清空我的应用数据' })).toBeDisabled();

    await user.type(screen.getByLabelText('确认文案'), '清空我的数据');
    await user.click(screen.getByRole('button', { name: '清空我的应用数据' }));

    await waitFor(() => expect(account.deleteMyApplicationData).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('应用数据已清空。你可以退出登录，或返回引导页重新设置。')).toBeInTheDocument();
  });

  it('shows a stable safe error when deletion fails', async () => {
    const user = userEvent.setup();
    const account: AccountRepository = {
      deleteMyApplicationData: vi.fn().mockRejectedValue(new Error('private provider detail')),
    };
    render(<SettingsPage account={account} />);

    await user.type(screen.getByLabelText('确认文案'), '清空我的数据');
    await user.click(screen.getByRole('button', { name: '清空我的应用数据' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('清空失败，请稍后重试。');
    expect(document.body.textContent).not.toContain('private provider detail');
  });
});
