import { expect, test, type BrowserContext, type Page } from 'playwright/test';

const TEST_CODE = '246810';
const sessions = new Map<string, string>();

async function installTestPlatform(context: BrowserContext) {
  await context.route('**/__daily-record-test-platform', async (route) => {
    const body = route.request().postDataJSON() as {
      operation: string;
      clientId: string;
      email?: string;
      code?: string;
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
      sessions.set(body.clientId, 'user-weight-workouts');
      await route.fulfill({ json: { user: { userId: 'user-weight-workouts' } } });
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

    await route.fulfill({
      status: currentUserId === undefined ? 401 : 404,
      json: {},
    });
  });
}

async function login(page: Page, expectedHeading: string) {
  await page.getByLabel('邮箱').fill('weight-workouts@example.test');
  await page.getByRole('button', { name: '获取验证码' }).click();
  await page.getByLabel('六位验证码').fill(TEST_CODE);
  await page.getByRole('button', { name: '注册或登录' }).click();
  await expect(page.getByRole('heading', { name: expectedHeading })).toBeVisible();
}

test.beforeEach(() => {
  sessions.clear();
});

test('mobile user can record weight, create workout, and copy latest workout', async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  try {
    await installTestPlatform(context);
    const page = await context.newPage();

    await page.goto('/weight?test-platform=1');
    await login(page, '记录体重变化');

    await page.getByLabel('日期').fill('2026-07-14');
    await page.getByLabel('体重（千克）').fill('70.4');
    await page.getByLabel('备注').fill('晨重');
    await page.getByRole('button', { name: '保存体重' }).click();
    await expect(page.getByRole('heading', { name: '70.4 kg' })).toBeVisible();
    await expect(page.getByText('晨重')).toBeVisible();
    await expect(page.getByText('数据还不够，先继续记录。')).toBeVisible();

    await page.goto('/workouts?test-platform=1');
    await expect(page.getByRole('heading', { name: '记录力量训练' })).toBeVisible();

    await page.getByLabel('日期').fill('2026-07-14');
    await page.getByLabel('训练部位').fill('胸');
    await page.getByLabel('时长（分钟）').fill('60');
    await page.getByLabel('动作名称').fill('卧推');
    await page.getByLabel('重量（千克）').fill('60');
    await page.getByLabel('次数').fill('8');
    await page.getByRole('button', { name: '保存训练' }).click();
    await expect(page.getByRole('heading', { name: '胸 · 60 分钟' })).toBeVisible();
    await expect(page.getByText('训练容量 480 kg')).toBeVisible();

    await page.getByLabel('日期').fill('2026-07-15');
    await page.getByRole('button', { name: '复制上次训练' }).first().click();
    await expect(page.getByRole('heading', { name: '胸 · 60 分钟' })).toHaveCount(2);
    await expect(page.getByText('2026-07-15')).toBeVisible();
  } finally {
    await context.close();
  }
});
