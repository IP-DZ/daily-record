import { expect, test, type BrowserContext, type Page } from 'playwright/test';

const TEST_CODE = '246810';
const profiles = new Map<string, unknown>();
const sessions = new Map<string, string>();

async function installTestPlatform(context: BrowserContext) {
  await context.route('**/__daily-record-test-platform', async (route) => {
    const body = route.request().postDataJSON() as {
      operation: string;
      clientId: string;
      email?: string;
      code?: string;
      value?: unknown;
    };
    const currentUserId = sessions.get(body.clientId);

    if (body.operation === 'request-code') {
      await route.fulfill({ json: {} });
      return;
    }
    if (body.operation === 'verify-code') {
      if (body.code !== TEST_CODE || body.email === undefined) {
        await route.fulfill({ status: 400, json: {} });
        return;
      }
      const userId = body.email.startsWith('alpha') ? 'user-a' : 'user-b';
      sessions.set(body.clientId, userId);
      await route.fulfill({ json: { user: { userId } } });
      return;
    }
    if (body.operation === 'current-user') {
      await route.fulfill({
        json: { user: currentUserId === undefined ? null : { userId: currentUserId } },
      });
      return;
    }
    if (body.operation === 'sign-out') {
      sessions.delete(body.clientId);
      await route.fulfill({ json: {} });
      return;
    }
    if (currentUserId === undefined) {
      await route.fulfill({ status: 401, json: {} });
      return;
    }
    if (body.operation === 'save-profile') {
      profiles.set(currentUserId, body.value);
      await route.fulfill({ json: {} });
      return;
    }
    if (body.operation === 'load-profile') {
      await route.fulfill({ json: { value: profiles.get(currentUserId) ?? null } });
      return;
    }
    await route.fulfill({ status: 404, json: {} });
  });
}

async function login(page: Page, email: string) {
  await page.getByLabel('邮箱').fill(email);
  await page.getByRole('button', { name: '获取验证码' }).click();
  await page.getByLabel('六位验证码').fill(TEST_CODE);
  await page.getByRole('button', { name: '注册或登录' }).click();
  await expect(page.getByRole('heading', { name: '设置你的增肌目标' })).toBeVisible();
}

async function saveTarget(page: Page, weight: string) {
  await page.getByLabel('年龄').fill('30');
  await page.getByLabel('生理性别').selectOption('male');
  await page.getByLabel('身高（厘米）').fill('175');
  await page.getByLabel('体重（千克）').fill(weight);
  await page.getByLabel('日常活动量').selectOption('moderate');
  await page.getByRole('button', { name: '计算增肌目标' }).click();
  await expect(page.getByText('已保存到此设备并同步到云端。')).toBeVisible();
}

test.beforeEach(() => {
  profiles.clear();
  sessions.clear();
});

test('email OTP, restore, A/B isolation, cross-context load and logout cleanup', async ({ browser }) => {
  test.setTimeout(60_000);
  const firstContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  await installTestPlatform(firstContext);
  const firstPage = await firstContext.newPage();
  await firstPage.goto('/onboarding?test-platform=1');

  await login(firstPage, 'alpha@example.test');
  await saveTarget(firstPage, '70');
  await firstPage.reload();
  await expect(firstPage.getByLabel('体重（千克）')).toHaveValue('70');

  await firstPage.getByRole('button', { name: '退出登录' }).click();
  await login(firstPage, 'beta@example.test');
  await expect(firstPage.getByLabel('年龄')).toHaveValue('');
  await saveTarget(firstPage, '75');
  await firstPage.getByRole('button', { name: '退出登录' }).click();
  await login(firstPage, 'alpha@example.test');
  await expect(firstPage.getByLabel('体重（千克）')).toHaveValue('70');

  const secondContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  await installTestPlatform(secondContext);
  const secondPage = await secondContext.newPage();
  await secondPage.goto('/onboarding?test-platform=1');
  await login(secondPage, 'alpha@example.test');
  await expect(secondPage.getByLabel('体重（千克）')).toHaveValue('70');

  await secondPage.getByRole('button', { name: '退出登录' }).click();
  await expect(secondPage.getByLabel('邮箱')).toBeVisible();
  await secondPage.reload();
  await expect(secondPage.getByLabel('邮箱')).toBeVisible();

  await secondContext.close();
  await firstContext.close();
});
