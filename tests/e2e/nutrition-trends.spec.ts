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
      sessions.set(body.clientId, 'user-nutrition-trends');
      await route.fulfill({ json: { user: { userId: 'user-nutrition-trends' } } });
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

async function login(page: Page, expectedHeading: string) {
  await page.getByLabel('邮箱').fill('nutrition-trends@example.test');
  await page.getByRole('button', { name: '获取验证码' }).click();
  await page.getByLabel('六位验证码').fill(TEST_CODE);
  await page.getByRole('button', { name: '注册或登录' }).click();
  await expect(page.getByRole('heading', { name: expectedHeading })).toBeVisible();
}

async function saveRecognizableTarget(page: Page) {
  await page.getByLabel('年龄').fill('30');
  await page.getByLabel('生理性别').selectOption('male');
  await page.getByLabel('身高（厘米）').fill('175');
  await page.getByLabel('体重（千克）').fill('70');
  await page.getByLabel('日常活动量').selectOption('moderate');
  await page.getByRole('button', { name: '计算增肌目标' }).click();
  await expect(page.getByText('已保存到此设备并同步到云端。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '每日增肌目标' })).toBeVisible();
  await expect(page.getByText('2811 千卡')).toBeVisible();
}

async function navigateInsideApp(page: Page, path: string) {
  await page.evaluate((nextPath) => {
    window.history.pushState({}, '', nextPath);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

test.beforeEach(() => {
  profiles.clear();
  sessions.clear();
});

test('mobile user can inspect editable nutrition trends from saved target and meals', async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  try {
    await installTestPlatform(context);
    const page = await context.newPage();

    await page.goto('/onboarding?test-platform=1');
    await login(page, '设置你的增肌目标');
    await saveRecognizableTarget(page);

    await navigateInsideApp(page, '/today?test-platform=1');
    await expect(page.getByRole('heading', { name: '今天吃了什么？' })).toBeVisible();
    const mealDate = await page.locator('input[type="date"]').inputValue();

    await page.getByLabel('餐食名称').fill('鸡胸饭');
    await page.getByLabel('份量').fill('1份');
    await page.getByLabel('热量').fill('620');
    await page.getByLabel('蛋白质').fill('42');
    await page.getByLabel('脂肪').fill('16');
    await page.getByLabel('碳水').fill('78');
    await page.getByRole('button', { name: '保存餐食' }).click();
    await expect(page.getByLabel('当日合计').getByText('总热量 620 kcal', { exact: true })).toBeVisible();

    await navigateInsideApp(page, '/nutrition-trends?test-platform=1');
    await expect(page.getByRole('heading', { name: '营养趋势' })).toBeVisible();
    await expect(page.getByText('目标和摄入均为估算，不构成医疗建议。')).toBeVisible();

    const dailyTrend = page.getByLabel('每日营养趋势');
    const mealDayRow = dailyTrend.getByRole('row', { name: new RegExp(mealDate) });
    await expect(mealDayRow.getByText('620 / 2811.1 kcal')).toBeVisible();
    await expect(mealDayRow.getByText('22%')).toBeVisible();

    const weeklyTrend = page.getByLabel('周营养汇总');
    await expect(weeklyTrend.getByText('620 / 2811.1 kcal')).toBeVisible();

    await page.getByRole('button', { name: '近 28 天' }).click();
    await expect(page.getByRole('button', { name: '近 28 天' })).toHaveAttribute('aria-pressed', 'true');
    await expect(dailyTrend.getByRole('row', { name: new RegExp(mealDate) }).getByText('620 / 2811.1 kcal')).toBeVisible();
  } finally {
    await context.close();
  }
});
