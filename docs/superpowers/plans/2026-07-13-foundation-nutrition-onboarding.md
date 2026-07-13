# 基础设施、营养计算与首次设置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可安装的移动端 React PWA，并用测试驱动方式打通身体资料输入、增肌营养目标计算、校验和可编辑预览。

**Architecture:** 领域计算保持纯 TypeScript，不依赖 React 或云平台；首次设置页面只通过 `SettingsRepository` 端口保存数据。首个切片使用浏览器草稿实现，后续 CloudBase 切片替换为远端实现而不改变页面接口。

**Tech Stack:** React、TypeScript、Vite、React Router、Zod、Vitest、Testing Library、Playwright、vite-plugin-pwa、pnpm。

## Global Constraints

- 首版面向 18 岁以上成年人和中国大陆网络环境，界面与文档默认中文。
- Mifflin–St Jeor、活动系数、10% 热量盈余、蛋白质 1.6–2.2 g/kg、脂肪 25% 与 4/4/9 换算必须严格按已确认规格。
- 计算结果必须显示“估算值，不构成医疗建议”；特殊健康情况不提供自动建议。
- 云密钥不得进入浏览器代码；本切片不接入任何真实密钥。
- 使用 TDD；每项实现前先运行对应失败测试，完成后提交一个可独立审查的 commit。
- 目标移动视口为 390×844；生产构建初始压缩 JavaScript 目标 ≤ 250 KB。

---

### Task 1: 建立 React、测试和移动端应用外壳

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `vite.config.ts`
- Create: `eslint.config.js`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/app/App.test.tsx`
- Create: `src/app/styles.css`
- Create: `src/test/setup.ts`

**Interfaces:**
- Consumes: 无。
- Produces: `App(): JSX.Element`、可运行的 `lint/typecheck/test/build` 命令，以及 `/onboarding`、`/today` 路由槽位。

- [ ] **Step 1: 创建包清单和安装依赖**

创建完整 `package.json`：

```json
{
  "name": "daily-record",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "typecheck": "tsc -b --pretty false",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test"
  }
}
```

运行：

```bash
pnpm add react react-dom react-router-dom zod
pnpm add -D typescript vite @vitejs/plugin-react eslint @eslint/js typescript-eslint globals vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom playwright vite-plugin-pwa
```

Expected: `pnpm-lock.yaml` 生成，命令退出码为 0。

- [ ] **Step 2: 写应用外壳失败测试**

创建 `src/app/App.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('renders the onboarding entry in Chinese', () => {
    render(<App />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { name: '每日记录' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '开始设置' })).toHaveAttribute('href', '/onboarding');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `pnpm test -- src/app/App.test.tsx`

Expected: FAIL，原因包含 `Cannot find module './App'`。

- [ ] **Step 4: 创建最小应用和配置**

`src/app/App.tsx`：

```tsx
import { Link, Route, Routes } from 'react-router-dom';
import './styles.css';

function WelcomePage() {
  return (
    <main className="page">
      <p className="eyebrow">增肌饮食与训练</p>
      <h1>每日记录</h1>
      <p>记录饮食、训练和体重变化。</p>
      <Link className="primary-action" to="/onboarding">开始设置</Link>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="*" element={<WelcomePage />} />
    </Routes>
  );
}
```

`src/main.tsx`：

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><App /></BrowserRouter></StrictMode>,
);
```

在 `vite.config.ts` 中配置 React、`test.environment = 'jsdom'`、`setupFiles = './src/test/setup.ts'`；`src/test/setup.ts` 只导入 `@testing-library/jest-dom/vitest`。CSS 使用单列、最大宽度 480px、44px 最小点击高度和系统中文字体栈。

- [ ] **Step 5: 运行基础验证**

Run: `pnpm lint && pnpm typecheck && pnpm test -- src/app/App.test.tsx && pnpm build`

Expected: 四条命令均退出码 0，`dist/index.html` 存在。

- [ ] **Step 6: 提交**

```bash
git add package.json pnpm-lock.yaml tsconfig*.json vite.config.ts eslint.config.js index.html src
git commit -m "chore: scaffold mobile PWA"
```

---

### Task 2: 以 TDD 实现营养目标领域计算

**Files:**
- Create: `src/domain/nutrition/types.ts`
- Create: `src/domain/nutrition/calculateNutritionTargets.ts`
- Create: `src/domain/nutrition/calculateNutritionTargets.test.ts`
- Create: `src/domain/nutrition/validateNutritionInputs.ts`
- Create: `src/domain/nutrition/validateNutritionInputs.test.ts`
- Create: `src/domain/nutrition/index.ts`

**Interfaces:**
- Consumes: `NutritionInputs`。
- Produces: `calculateNutritionTargets(input): NutritionTargets`、`nutritionInputsSchema`。

- [ ] **Step 1: 定义类型并写公式失败测试**

`src/domain/nutrition/types.ts`：

```ts
export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'veryHigh';

export interface NutritionInputs {
  age: number;
  sex: Sex;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  proteinGramsPerKg: number;
  fatCalorieRatio: number;
  surplusRatio: number;
}

export interface NutritionTargets {
  restingKcal: number;
  maintenanceKcal: number;
  caloriesKcal: number;
  proteinGrams: number;
  fatGrams: number;
  carbsGrams: number;
}
```

`calculateNutritionTargets.test.ts` 必须包含：

```ts
it('calculates the accepted male example without rounding internal values', () => {
  const result = calculateNutritionTargets({
    age: 30, sex: 'male', heightCm: 175, weightKg: 70,
    activityLevel: 'moderate', proteinGramsPerKg: 1.6,
    fatCalorieRatio: 0.25, surplusRatio: 0.1,
  });
  expect(result.restingKcal).toBeCloseTo(1648.75, 5);
  expect(result.maintenanceKcal).toBeCloseTo(2555.5625, 5);
  expect(result.caloriesKcal).toBeCloseTo(2811.11875, 5);
  expect(result.proteinGrams).toBeCloseTo(112, 5);
  expect(result.fatGrams).toBeCloseTo(78.0866, 3);
  expect(result.carbsGrams).toBeCloseTo(415.0848, 3);
});

it('uses the female Mifflin constant', () => {
  const result = calculateNutritionTargets({
    age: 30, sex: 'female', heightCm: 165, weightKg: 60,
    activityLevel: 'sedentary', proteinGramsPerKg: 1.8,
    fatCalorieRatio: 0.25, surplusRatio: 0.1,
  });
  expect(result.restingKcal).toBeCloseTo(1320.25, 5);
});
```

- [ ] **Step 2: 运行公式测试确认失败**

Run: `pnpm test -- src/domain/nutrition/calculateNutritionTargets.test.ts`

Expected: FAIL，原因是计算函数尚不存在。

- [ ] **Step 3: 实现最小纯函数**

```ts
const activityFactors: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  veryHigh: 1.9,
};

export function calculateNutritionTargets(input: NutritionInputs): NutritionTargets {
  const sexConstant = input.sex === 'male' ? 5 : -161;
  const restingKcal = 10 * input.weightKg + 6.25 * input.heightCm - 5 * input.age + sexConstant;
  const maintenanceKcal = restingKcal * activityFactors[input.activityLevel];
  const caloriesKcal = maintenanceKcal * (1 + input.surplusRatio);
  const proteinGrams = input.weightKg * input.proteinGramsPerKg;
  const fatGrams = (caloriesKcal * input.fatCalorieRatio) / 9;
  const carbsGrams = (caloriesKcal - proteinGrams * 4 - fatGrams * 9) / 4;
  return { restingKcal, maintenanceKcal, caloriesKcal, proteinGrams, fatGrams, carbsGrams };
}
```

- [ ] **Step 4: 写输入边界失败测试**

测试 `age < 18`、身高/体重非正数、蛋白质低于 1.6 或高于 2.2、脂肪比例非正数、剩余碳水为负，以及 `sex` 缺失时拒绝自动计算。

```ts
expect(() => nutritionInputsSchema.parse({ ...validInput, age: 17 })).toThrow();
expect(() => nutritionInputsSchema.parse({ ...validInput, proteinGramsPerKg: 2.3 })).toThrow();
expect(() => nutritionInputsSchema.parse({ ...validInput, weightKg: 0 })).toThrow();
```

- [ ] **Step 5: 用 Zod 实现输入校验**

`nutritionInputsSchema` 对年龄使用 `int().min(18).max(100)`，身高 `100..250` cm，体重 `30..350` kg，蛋白质 `1.6..2.2`，脂肪比例 `0.15..0.4`，盈余比例 `0..0.3`；`superRefine` 调用计算函数并在 `carbsGrams < 0` 时添加 `碳水目标不能为负数`。

- [ ] **Step 6: 运行领域验证并提交**

Run: `pnpm test -- src/domain/nutrition && pnpm typecheck`

Expected: 所有领域测试 PASS，类型检查退出码 0。

```bash
git add src/domain/nutrition
git commit -m "feat: calculate nutrition targets"
```

---

### Task 3: 建立首次设置端口与浏览器草稿实现

**Files:**
- Create: `src/features/onboarding/model/onboardingTypes.ts`
- Create: `src/features/onboarding/model/SettingsRepository.ts`
- Create: `src/features/onboarding/model/browserDraftSettingsRepository.ts`
- Create: `src/features/onboarding/model/browserDraftSettingsRepository.test.ts`
- Create: `src/platform/storage/safeLocalStorage.ts`

**Interfaces:**
- Consumes: `NutritionInputs`、`NutritionTargets`。
- Produces: `SettingsRepository.saveDraft/loadDraft/clearDraft`，后续 CloudBase 实现必须满足同一接口。

- [ ] **Step 1: 写端口和持久化失败测试**

```ts
export interface OnboardingDraft {
  inputs: NutritionInputs;
  targets: NutritionTargets;
  savedAt: string;
}

export type OnboardingDraftInput = Omit<OnboardingDraft, 'savedAt'>;

export interface SettingsRepository {
  saveDraft(draft: OnboardingDraftInput): Promise<void>;
  loadDraft(): Promise<OnboardingDraft | null>;
  clearDraft(): Promise<void>;
}
```

测试要求：保存后由仓库使用注入时钟补充 `savedAt` 并可加载；损坏 JSON 返回 `null` 并清除；`clearDraft` 后为空；显式传入时钟，使 `savedAt` 可预测。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm test -- src/features/onboarding/model/browserDraftSettingsRepository.test.ts`

Expected: FAIL，原因是 repository 实现不存在。

- [ ] **Step 3: 实现最小浏览器草稿仓库**

实现固定键 `daily-record:onboarding-draft:v1`，构造函数接收 `Storage` 和 `now: () => Date`。读取时使用 Zod schema 解析完整对象；解析失败删除损坏值并返回 `null`。不得捕获后静默保留损坏数据。

- [ ] **Step 4: 运行验证并提交**

Run: `pnpm test -- src/features/onboarding/model && pnpm typecheck`

Expected: repository 测试全部 PASS。

```bash
git add src/features/onboarding src/platform/storage
git commit -m "feat: persist onboarding draft"
```

---

### Task 4: 实现首次设置表单和目标预览

**Files:**
- Create: `src/features/onboarding/OnboardingPage.tsx`
- Create: `src/features/onboarding/OnboardingPage.test.tsx`
- Create: `src/features/onboarding/NutritionTargetPreview.tsx`
- Create: `src/features/onboarding/onboarding.css`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: `calculateNutritionTargets`、`nutritionInputsSchema`、`SettingsRepository`。
- Produces: `/onboarding` 页面；成功时显示整数化的热量、蛋白质、脂肪、碳水目标并保存草稿。

- [ ] **Step 1: 写用户行为失败测试**

Testing Library 用例必须：

```tsx
it('calculates and saves editable muscle-gain targets', async () => {
  const user = userEvent.setup();
  const repository = createMemorySettingsRepository();
  render(<OnboardingPage repository={repository} />);
  await user.type(screen.getByLabelText('年龄'), '30');
  await user.selectOptions(screen.getByLabelText('生理性别'), 'male');
  await user.type(screen.getByLabelText('身高（厘米）'), '175');
  await user.type(screen.getByLabelText('体重（千克）'), '70');
  await user.selectOptions(screen.getByLabelText('日常活动量'), 'moderate');
  await user.click(screen.getByRole('button', { name: '计算增肌目标' }));
  expect(screen.getByText('2811 千卡')).toBeInTheDocument();
  expect(screen.getByText(/估算值，不构成医疗建议/)).toBeInTheDocument();
  expect(await repository.loadDraft()).not.toBeNull();
});
```

另写未满 18 岁显示错误、未选择生理性别时提示改用手动目标、用户修改蛋白质目标后重新计算的用例。

- [ ] **Step 2: 运行页面测试确认失败**

Run: `pnpm test -- src/features/onboarding/OnboardingPage.test.tsx`

Expected: FAIL，原因是页面尚不存在。

- [ ] **Step 3: 实现最小表单**

使用字符串状态保存表单值，避免把空字符串转换为 `0`；默认 `proteinGramsPerKg = 1.6`、`fatCalorieRatio = 0.25`、`surplusRatio = 0.1`，其他字段初始为空。页面加载时调用 `repository.loadDraft()` 恢复已有 inputs 与 targets，并对加载/保存失败显示可恢复错误。点击计算时先 `safeParse`，错误逐字段显示并关联 `aria-describedby`；成功后保存内部小数结果，预览只使用 `Math.round`。页面必须包含特殊情况提示和可操作的“改用手动设置”入口；点击后显示手动设置说明，本切片不实现云端保存或最终手动目标提交。

- [ ] **Step 4: 接入路由和移动样式**

在 `App.tsx` 新增：

```tsx
<Route path="/onboarding" element={<OnboardingPage repository={settingsRepository} />} />
```

在应用组合根通过 `safeLocalStorage()` 创建 `BrowserDraftSettingsRepository`；存储不可用时显示可恢复提示，禁止使用非空断言。表单单列布局；数字输入使用 `inputMode="decimal"`；主按钮固定至少 48px 高；进度和营养值不能只依赖颜色表达。

- [ ] **Step 5: 运行组件回归并提交**

Run: `pnpm test -- src/app src/features/onboarding src/domain/nutrition && pnpm lint && pnpm typecheck`

Expected: 全部 PASS，无 ESLint/TypeScript 错误。

```bash
git add src/app src/features/onboarding
git commit -m "feat: add nutrition onboarding"
```

---

### Task 5: 配置 PWA、移动端 E2E 和切片验收

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `vite.config.ts`
- Modify: `src/app/App.tsx`
- Create: `src/app/PwaUpdatePrompt.tsx`
- Create: `src/app/PwaUpdatePrompt.test.tsx`
- Create: `public/icons/icon.svg`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Create: `public/robots.txt`
- Create: `playwright.config.ts`
- Create: `tests/e2e/onboarding.spec.ts`
- Create: `docs/operations/local-development.md`

**Interfaces:**
- Consumes: `/` 与 `/onboarding` 页面。
- Produces: Web App Manifest、Service Worker、移动 Chromium E2E 和本地运行说明。

- [ ] **Step 1: 写移动端 E2E**

```ts
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
```

- [ ] **Step 2: 运行 E2E 确认 PWA 配置前的失败状态**

Run: `pnpm exec playwright install chromium && pnpm test:e2e -- tests/e2e/onboarding.spec.ts`

Expected: 首次执行至少因缺少 Playwright 配置或应用服务器而 FAIL；保存失败输出摘要，不保留完整噪声日志。

- [ ] **Step 3: 配置 Playwright 和 PWA**

`playwright.config.ts` 从 `playwright/test` 导入，声明项目名 `mobile-chromium`，使用 `baseURL: 'http://127.0.0.1:4173'`，`webServer.command: 'pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 4173 --strictPort'`，失败保留 screenshot/trace。`VitePWA` 配置：

```ts
VitePWA({
  registerType: 'prompt',
  manifest: {
    name: '每日记录',
    short_name: '每日记录',
    description: '记录每日饮食、训练和体重',
    theme_color: '#173b2f',
    background_color: '#f6f3ea',
    display: 'standalone',
    start_url: '/',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  },
})
```

Service Worker 只缓存静态外壳；不得缓存验证码、用户 API 响应或未来的私有图片。

使用 `virtual:pwa-register/react` 实现可见的更新提示组件：发现新版本时显示“发现新版本”与“立即更新”按钮，用户点击后调用 `updateServiceWorker(true)`；离线就绪提示可关闭。不得静默自动刷新正在填写的表单。

- [ ] **Step 4: 运行完整切片验证**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e -- --project=mobile-chromium
```

Expected: 全部退出码 0；`dist/manifest.webmanifest` 与 Service Worker 文件存在；390×844 E2E PASS；PWA 更新提示组件测试 PASS。

- [ ] **Step 5: 检查包体和敏感信息**

Run:

```bash
du -sh dist
find dist/assets -name '*.js' -exec gzip -c {} \; | wc -c
sips -g pixelWidth -g pixelHeight public/icons/icon-192.png public/icons/icon-512.png
rg -n "SECRET|PRIVATE_KEY|API_KEY|sk-" dist src || true
```

Expected: 入口 JavaScript gzip 合计 ≤ 250 KB；两个 PNG 分别为 192×192 和 512×512；敏感信息扫描没有真实密钥命中。

- [ ] **Step 6: 提交并更新主计划恢复点**

```bash
git add vite.config.ts public playwright.config.ts tests docs/operations docs/anvil/plans/2026-07-13-personal-fitness-nutrition-pwa-plan.md
git commit -m "test: verify onboarding PWA slice"
```

将 Anvil 主计划任务 1 标记完成，并记录实际命令结果、commit SHA 和下一步“任务 2：CloudBase 账号与数据隔离”。

## 自检结果

- 规格覆盖：首个切片完整覆盖 PWA 基座、Mifflin–St Jeor、活动系数、增肌目标、输入边界、估算提示、草稿恢复和移动端验收；云登录、饮食、AI、训练和趋势由 Anvil 主 DAG 后续切片覆盖。
- 占位符扫描：未发现占位语或未定义的测试要求。
- 类型一致性：`NutritionInputs`、`NutritionTargets`、`OnboardingDraft` 和 `SettingsRepository` 的名称与主架构计划一致。
