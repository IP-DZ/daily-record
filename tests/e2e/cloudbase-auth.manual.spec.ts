import { expect, test, type Browser, type BrowserContext, type Page } from 'playwright/test';

test.use({ trace: 'off', screenshot: 'off', video: 'off' });
test.describe.configure({ mode: 'serial', retries: 0 });

async function freshMobileContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
}

async function openLogin(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/onboarding');
  await expect(page.getByLabel('邮箱')).toBeVisible();
  return page;
}

async function operatorLogin(page: Page, account: 'A' | 'B') {
  await test.step(`操作人：在当前窗口输入隔离邮箱 ${account} 及当次 OTP，完成登录后继续`, async () => {
    await page.pause();
  });
  await expect(page.getByRole('heading', { name: '设置你的增肌目标' })).toBeVisible();
}

async function saveRecognizableTarget(page: Page, weightKg: '70' | '75') {
  await page.getByLabel('年龄').fill('30');
  await page.getByLabel('生理性别').selectOption('male');
  await page.getByLabel('身高（厘米）').fill('175');
  await page.getByLabel('体重（千克）').fill(weightKg);
  await page.getByLabel('日常活动量').selectOption('moderate');
  await page.getByRole('button', { name: '计算增肌目标' }).click();
  await expect(page.getByText('已保存到此设备并同步到云端。')).toBeVisible();
}

test('manual real CloudBase: A/B isolation, A cross-device restore, and logout persistence', async ({ browser }) => {
  test.skip(
    process.env.CLOUDBASE_MANUAL_E2E !== '1',
    '仅在显式启用隔离 CloudBase 环境且由操作人交互登录时运行',
  );
  test.setTimeout(0);

  const contexts: BrowserContext[] = [];
  try {
    const accountADeviceOne = await freshMobileContext(browser);
    contexts.push(accountADeviceOne);
    const pageA1 = await openLogin(accountADeviceOne);
    await operatorLogin(pageA1, 'A');
    await saveRecognizableTarget(pageA1, '70');

    const accountBDevice = await freshMobileContext(browser);
    contexts.push(accountBDevice);
    const pageB = await openLogin(accountBDevice);
    await operatorLogin(pageB, 'B');
    await expect(pageB.getByLabel('年龄')).toHaveValue('');
    await expect(pageB.getByLabel('体重（千克）')).toHaveValue('');
    await saveRecognizableTarget(pageB, '75');

    await pageA1.reload();
    await expect(pageA1.getByLabel('体重（千克）')).toHaveValue('70');
    await pageB.reload();
    await expect(pageB.getByLabel('体重（千克）')).toHaveValue('75');

    const accountADeviceTwo = await freshMobileContext(browser);
    contexts.push(accountADeviceTwo);
    const pageA2 = await openLogin(accountADeviceTwo);
    await operatorLogin(pageA2, 'A');
    await expect(pageA2.getByLabel('体重（千克）')).toHaveValue('70');

    await pageA2.getByRole('button', { name: '退出登录' }).click();
    await expect(pageA2.getByLabel('邮箱')).toBeVisible();
    await pageA2.reload();
    await expect(pageA2.getByLabel('邮箱')).toBeVisible();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
