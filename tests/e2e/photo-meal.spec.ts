import { expect, test, type BrowserContext, type Page } from 'playwright/test';

const TEST_CODE = '246810';
const sessions = new Map<string, string>();
const onePixelPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

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
      sessions.set(body.clientId, 'user-photo-meal');
      await route.fulfill({ json: { user: { userId: 'user-photo-meal' } } });
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

async function loginOnPhotoMeal(page: Page) {
  await page.getByLabel('邮箱').fill('photo-meal@example.test');
  await page.getByRole('button', { name: '获取验证码' }).click();
  await page.getByLabel('六位验证码').fill(TEST_CODE);
  await page.getByRole('button', { name: '注册或登录' }).click();
  await expect(page.getByRole('heading', { name: '拍照记录饮食' })).toBeVisible();
}

test.beforeEach(() => {
  sessions.clear();
});

test('mobile user can confirm an editable photo meal estimate into today totals', async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  try {
    await installTestPlatform(context);
    const page = await context.newPage();

    await page.goto('/photo-meal?test-platform=1');
    await loginOnPhotoMeal(page);

    await expect(page.getByText('照片会发送给第三方视觉模型处理')).toBeVisible();
    await expect(page.getByText('结果是可编辑估算，不构成医疗建议')).toBeVisible();
    await expect(page.getByText('确认前不会计入今日汇总')).toBeVisible();

    await page.getByLabel('选择餐食照片').setInputFiles({
      name: 'meal.png',
      mimeType: 'image/png',
      buffer: onePixelPng,
    });
    await expect(page.getByRole('heading', { name: 'AI 估算结果' })).toBeVisible();
    await expect(page.getByText('番茄炒蛋盖饭')).toBeVisible();

    await page.getByLabel('热量 1').fill('650');
    await page.getByRole('button', { name: '确认并计入今日饮食' }).click();
    await expect(page.getByText('已生成 1 条正式餐食记录。')).toBeVisible();

    await page.getByRole('link', { name: '查看今日汇总' }).click();
    const totals = page.getByLabel('当日合计');
    await expect(totals.getByText('总热量 650 kcal', { exact: true })).toBeVisible();
    await expect(totals.getByText('蛋白质 28 g', { exact: true })).toBeVisible();
    await expect(totals.getByText('脂肪 18 g', { exact: true })).toBeVisible();
    await expect(totals.getByText('碳水 62 g', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '番茄炒蛋盖饭' })).toBeVisible();
  } finally {
    await context.close();
  }
});
