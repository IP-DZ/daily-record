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
      sessions.set(body.clientId, 'user-meals');
      await route.fulfill({ json: { user: { userId: 'user-meals' } } });
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

async function loginOnToday(page: Page) {
  await page.getByLabel('邮箱').fill('meals@example.test');
  await page.getByRole('button', { name: '获取验证码' }).click();
  await page.getByLabel('六位验证码').fill(TEST_CODE);
  await page.getByRole('button', { name: '注册或登录' }).click();
  await expect(page.getByRole('heading', { name: '今天吃了什么？' })).toBeVisible();
}

test.beforeEach(() => {
  sessions.clear();
});

test('mobile user can add and delete a manual meal with exact totals', async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: 'block',
  });
  await installTestPlatform(context);
  const page = await context.newPage();

  await page.goto('/today?test-platform=1');
  await loginOnToday(page);

  await page.getByLabel('餐食名称').fill('鸡胸饭');
  await page.getByLabel('份量').fill('1份');
  await page.getByLabel('热量').fill('620');
  await page.getByLabel('蛋白质').fill('42');
  await page.getByLabel('脂肪').fill('16');
  await page.getByLabel('碳水').fill('78');
  await page.getByRole('button', { name: '保存餐食' }).click();

  const totals = page.getByLabel('当日合计');
  await expect(totals.getByText('总热量 620 kcal', { exact: true })).toBeVisible();
  await expect(totals.getByText('蛋白质 42 g', { exact: true })).toBeVisible();
  await expect(totals.getByText('脂肪 16 g', { exact: true })).toBeVisible();
  await expect(totals.getByText('碳水 78 g', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '鸡胸饭' })).toBeVisible();

  await page.getByRole('button', { name: '删除鸡胸饭' }).click();

  await expect(totals.getByText('总热量 0 kcal', { exact: true })).toBeVisible();
  await expect(totals.getByText('蛋白质 0 g', { exact: true })).toBeVisible();
  await expect(totals.getByText('脂肪 0 g', { exact: true })).toBeVisible();
  await expect(totals.getByText('碳水 0 g', { exact: true })).toBeVisible();
  await expect(page.getByText('还没有记录餐食。')).toBeVisible();
  await expect(page.getByRole('heading', { name: '鸡胸饭' })).toHaveCount(0);

  await context.close();
});
