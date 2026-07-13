import { expect, test } from 'playwright/test';

test.use({ viewport: { width: 390, height: 844 } });

test('completes onboarding and restores the draft', async ({ page }) => {
  await page.goto('/onboarding');
  await page.getByLabel('年龄').fill('30');
  await page.getByLabel('生理性别').selectOption('male');
  await page.getByLabel('身高（厘米）').fill('175');
  await page.getByLabel('体重（千克）').fill('70');
  await page.getByLabel('日常活动量').selectOption('moderate');
  await page.getByRole('button', { name: '计算增肌目标' }).click();
  await expect(page.getByText('2811 千卡')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('体重（千克）')).toHaveValue('70');
});
