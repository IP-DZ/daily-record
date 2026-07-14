import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MealEntry } from '@daily-record/contracts';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthPort } from '../platform/auth';
import type { MealsRepository } from '../platform/meals';
import type { ProfileSettingsRepository } from '../platform/settings/ProfileSettingsRepository';
import { App } from './App';

const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function createMealsRepository(meals: MealEntry[] = []): MealsRepository {
  return {
    listByDate: vi.fn().mockResolvedValue({
      meals,
      totals: {
        caloriesKcal: meals.reduce((sum, meal) => sum + meal.nutrition.caloriesKcal, 0),
        proteinGrams: meals.reduce((sum, meal) => sum + meal.nutrition.proteinGrams, 0),
        fatGrams: meals.reduce((sum, meal) => sum + meal.nutrition.fatGrams, 0),
        carbsGrams: meals.reduce((sum, meal) => sum + meal.nutrition.carbsGrams, 0),
      },
    }),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    copy: vi.fn(),
  } as MealsRepository;
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createMemoryStorage(),
  });
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
  if (localStorageDescriptor !== undefined) {
    Object.defineProperty(window, 'localStorage', localStorageDescriptor);
  }
});

describe('App', () => {
  it('renders the onboarding entry in Chinese', () => {
    render(<App />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { name: '每日记录' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '开始设置' })).toHaveAttribute('href', '/onboarding');
  });

  it('renders the real onboarding form at /onboarding', async () => {
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '设置你的增肌目标' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '计算增肌目标' })).toBeInTheDocument();
  });

  it('keeps the today route behind the authenticated session', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn().mockResolvedValue(undefined),
      verifyEmailCode: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      currentUser: vi.fn().mockResolvedValue(null),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;

    render(
      <MemoryRouter initialEntries={['/today']}>
        <App auth={auth} meals={createMealsRepository()} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '注册或登录' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '今天吃了什么？' })).not.toBeInTheDocument();
  });

  it('renders the today tool after auth restores and uses the injected meals repository', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-today' }),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;
    const meals = createMealsRepository([
      {
        id: 'meal-route',
        mealDate: '2026-07-14',
        name: '路由餐',
        amount: '1份',
        nutrition: {
          caloriesKcal: 500,
          proteinGrams: 35,
          fatGrams: 10,
          carbsGrams: 65,
        },
        createdAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-14T00:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/today']}>
        <App auth={auth} meals={meals} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '今天吃了什么？' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '路由餐' })).toBeInTheDocument();
    expect(meals.listByDate).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('shows a recoverable notice when browser storage is unavailable', async () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('storage unavailable');
      },
    });

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/本地存储暂不可用.*仍可填写和预览/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '计算增肌目标' })).toBeInTheDocument();
  });

  it('injects an auth port and gates onboarding behind the restored session', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn().mockResolvedValue(undefined),
      verifyEmailCode: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      currentUser: vi.fn().mockResolvedValue(null),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <App auth={auth} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '注册或登录' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '设置你的增肌目标' })).not.toBeInTheDocument();
  });

  it('loads authenticated onboarding from the remote profile when that user has no local draft', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn(), verifyEmailCode: vi.fn(), signOut: vi.fn(),
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-remote' }),
    } as AuthPort;
    const profileSettings: ProfileSettingsRepository = {
      save: vi.fn(),
      load: vi.fn().mockResolvedValue({
        inputs: {
          age: 34, sex: 'male', heightCm: 180, weightKg: 82, activityLevel: 'moderate',
          proteinGramsPerKg: 1.8, fatCalorieRatio: 0.25, surplusRatio: 0.1,
        },
        trainingDaysPerWeek: 4,
        trainingExperience: 'advanced',
        targets: {
          restingKcal: 1810, maintenanceKcal: 2805.5, caloriesKcal: 3086.05,
          proteinGrams: 147.6, fatGrams: 85.7236111111, carbsGrams: 431.284375,
        },
      }),
    };

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <App auth={auth} profileSettings={profileSettings} />
      </MemoryRouter>,
    );

    expect(await screen.findByDisplayValue('34')).toBeInTheDocument();
    expect(profileSettings.load).toHaveBeenCalledTimes(1);
  });

  it('clears only the signed-out user local namespace after successful logout', async () => {
    window.localStorage.setItem('daily-record:onboarding-draft:v2:user:user-a', 'current');
    window.localStorage.setItem('daily-record:onboarding-draft:v2:user:user-b', 'other');
    window.localStorage.setItem('daily-record:onboarding-draft:v2:guest', 'guest');
    const auth: AuthPort = {
      requestEmailCode: vi.fn(), verifyEmailCode: vi.fn(), signOut: vi.fn().mockResolvedValue(undefined),
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-a' }),
    } as AuthPort;
    const profileSettings: ProfileSettingsRepository = {
      load: vi.fn().mockResolvedValue(null), save: vi.fn(),
    };
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <App auth={auth} profileSettings={profileSettings} />
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole('button', { name: '退出登录' }));
    await screen.findByLabelText('邮箱');

    await waitFor(() => {
      expect(window.localStorage.getItem('daily-record:onboarding-draft:v2:user:user-a')).toBeNull();
    });
    expect(window.localStorage.getItem('daily-record:onboarding-draft:v2:user:user-b')).toBe('other');
    expect(window.localStorage.getItem('daily-record:onboarding-draft:v2:guest')).toBe('guest');
  });

  it('keeps the offline demo accessible and clearly reports missing CloudBase config', async () => {
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <App cloudBaseEnv={{}} />
      </MemoryRouter>,
    );

    expect(screen.getByText('尚未配置 CloudBase 测试环境')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '设置你的增肌目标' })).toBeInTheDocument();
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();
  });

  it('loads the isolated test platform only for the explicit test-mode URL opt-in', async () => {
    window.history.replaceState({}, '', '/?test-platform=1');
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ user: null })),
    );

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <App cloudBaseEnv={{}} />
      </MemoryRouter>,
    );

    expect(await screen.findByLabelText('邮箱')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith(
      '/__daily-record-test-platform',
      expect.objectContaining({ method: 'POST' }),
    );
    fetcher.mockRestore();
  });

  it('fails closed when platform loading fails and can retry successfully', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn().mockResolvedValue(undefined),
      verifyEmailCode: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      currentUser: vi.fn().mockResolvedValue(null),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;
    const loader = vi.fn()
      .mockRejectedValueOnce(new Error('private provider detail'))
      .mockResolvedValueOnce({
        auth,
        profileSettings: { load: vi.fn().mockResolvedValue(null), save: vi.fn() },
      });

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <App
          cloudBaseEnv={{
            VITE_CLOUDBASE_ENV_ID: 'environment-id',
            VITE_CLOUDBASE_PUBLISHABLE_KEY: 'public-key',
          }}
          platformLoader={loader}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('认证服务加载失败，请稍后重试。');
    expect(document.body.textContent).not.toContain('private provider detail');
    expect(screen.queryByRole('heading', { name: '设置你的增肌目标' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('邮箱')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '重新连接' }));
    expect(await screen.findByLabelText('邮箱')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
