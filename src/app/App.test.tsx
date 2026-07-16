import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MealEntry, WeightEntry, WorkoutSession } from '@daily-record/contracts';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthPort } from '../platform/auth';
import type { MealsRepository } from '../platform/meals';
import type { NutritionGoalsRepository } from '../platform/nutritionGoals';
import type { PhotoMealAnalysisRepository } from '../platform/photoMeal';
import type { ProfileSettingsRepository } from '../platform/settings/ProfileSettingsRepository';
import type { WeightRepository } from '../platform/weight';
import type { WorkoutsRepository } from '../platform/workouts';
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

function createNutritionGoalsRepository(): NutritionGoalsRepository {
  return {
    listByDateRange: vi.fn().mockResolvedValue([{
      version: 1,
      effectiveDate: '2026-07-01',
      targets: {
        restingKcal: 1700,
        maintenanceKcal: 2600,
        caloriesKcal: 2860,
        proteinGrams: 140,
        fatGrams: 79,
        carbsGrams: 390,
      },
      createdAt: '2026-07-01T08:00:00.000Z',
    }]),
  };
}

function createWeightRepository(entries: WeightEntry[] = []): WeightRepository {
  return {
    listByDateRange: vi.fn().mockResolvedValue(entries),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as WeightRepository;
}

function createWorkoutsRepository(sessions: WorkoutSession[] = []): WorkoutsRepository {
  return {
    listByDateRange: vi.fn().mockResolvedValue(sessions),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    copyLatest: vi.fn(),
  } as WorkoutsRepository;
}

function createPhotoMealRepository(): PhotoMealAnalysisRepository {
  return {
    create: vi.fn(),
    get: vi.fn(),
    confirm: vi.fn(),
    discard: vi.fn(),
  } as PhotoMealAnalysisRepository;
}

function createAccountRepository() {
  return {
    deleteMyApplicationData: vi.fn().mockResolvedValue({ deleted: true }),
  };
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

  it('connects the today draft repository to the restored user namespace', async () => {
    window.localStorage.setItem(
      'daily-record:offline-draft:v1:user:user-today:page:today-meal',
      JSON.stringify({
        selectedDate: '2026-07-14',
        formValues: {
          name: '路由草稿餐',
          amount: '1份',
          caloriesKcal: '500',
          proteinGrams: '35',
          fatGrams: '10',
          carbsGrams: '65',
        },
      }),
    );
    const auth: AuthPort = {
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-today' }),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;

    render(
      <MemoryRouter initialEntries={['/today']}>
        <App auth={auth} meals={createMealsRepository()} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '今天吃了什么？' })).toBeInTheDocument();
    expect(await screen.findByText('发现未提交草稿')).toBeInTheDocument();
  });

  it('keeps the weight route behind the authenticated session', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn().mockResolvedValue(undefined),
      verifyEmailCode: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      currentUser: vi.fn().mockResolvedValue(null),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;

    render(
      <MemoryRouter initialEntries={['/weight']}>
        <App auth={auth} weight={createWeightRepository()} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '注册或登录' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '记录体重变化' })).not.toBeInTheDocument();
  });

  it('renders the weight tool after auth restores and uses the injected weight repository', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-weight' }),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;
    const weight = createWeightRepository([
      {
        id: 'weight-route',
        entryDate: '2026-07-14',
        weightKg: 70.4,
        note: '路由体重',
        createdAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-14T00:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/weight']}>
        <App auth={auth} weight={weight} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '记录体重变化' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '70.4 kg' })).toBeInTheDocument();
    expect(weight.listByDateRange).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it('keeps the workouts route behind the authenticated session', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn().mockResolvedValue(undefined),
      verifyEmailCode: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      currentUser: vi.fn().mockResolvedValue(null),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;

    render(
      <MemoryRouter initialEntries={['/workouts']}>
        <App auth={auth} workouts={createWorkoutsRepository()} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '注册或登录' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '记录力量训练' })).not.toBeInTheDocument();
  });

  it('renders the workouts tool after auth restores and uses the injected workouts repository', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-workouts' }),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;
    const workouts = createWorkoutsRepository([
      {
        id: 'workout-route',
        workoutDate: '2026-07-14',
        bodyParts: ['胸'],
        durationMinutes: 60,
        note: '',
        volumeKg: 480,
        exercises: [{
          id: 'exercise-route',
          name: '卧推',
          order: 1,
          sets: [{
            id: 'set-route',
            order: 1,
            weightKg: 60,
            reps: 8,
            completed: true,
          }],
        }],
        createdAt: '2026-07-14T00:00:00.000Z',
        updatedAt: '2026-07-14T00:00:00.000Z',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/workouts']}>
        <App auth={auth} workouts={workouts} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '记录力量训练' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: '胸 · 60 分钟' })).toBeInTheDocument();
    expect(workouts.listByDateRange).toHaveBeenCalledWith(
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it('keeps the photo meal route behind the authenticated session', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn().mockResolvedValue(undefined),
      verifyEmailCode: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      currentUser: vi.fn().mockResolvedValue(null),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;

    render(
      <MemoryRouter initialEntries={['/photo-meal']}>
        <App auth={auth} photoMeals={createPhotoMealRepository()} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '注册或登录' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '拍照记录饮食' })).not.toBeInTheDocument();
  });

  it('renders the photo meal tool after auth restores', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-photo' }),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;

    render(
      <MemoryRouter initialEntries={['/photo-meal']}>
        <App auth={auth} photoMeals={createPhotoMealRepository()} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '拍照记录饮食' })).toBeInTheDocument();
    expect(screen.getByText('照片会发送给第三方视觉模型处理')).toBeInTheDocument();
  });

  it('keeps the nutrition trends route behind the authenticated session', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn().mockResolvedValue(undefined),
      verifyEmailCode: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      currentUser: vi.fn().mockResolvedValue(null),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;

    render(
      <MemoryRouter initialEntries={['/nutrition-trends']}>
        <App auth={auth} meals={createMealsRepository()} nutritionGoals={createNutritionGoalsRepository()} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '注册或登录' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '营养趋势' })).not.toBeInTheDocument();
  });

  it('renders the nutrition trends page after auth restores', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-trends' }),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;
    const nutritionGoals = createNutritionGoalsRepository();

    render(
      <MemoryRouter initialEntries={['/nutrition-trends']}>
        <App auth={auth} meals={createMealsRepository()} nutritionGoals={nutritionGoals} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '营养趋势' })).toBeInTheDocument();
    await waitFor(() => {
      expect(nutritionGoals.listByDateRange).toHaveBeenCalled();
    });
  });

  it('keeps the integrated trends route behind the authenticated session', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn().mockResolvedValue(undefined),
      verifyEmailCode: vi.fn().mockResolvedValue({ userId: 'user-1' }),
      currentUser: vi.fn().mockResolvedValue(null),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;

    render(
      <MemoryRouter initialEntries={['/trends']}>
        <App
          auth={auth}
          meals={createMealsRepository()}
          nutritionGoals={createNutritionGoalsRepository()}
          weight={createWeightRepository()}
          workouts={createWorkoutsRepository()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '注册或登录' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '综合趋势' })).not.toBeInTheDocument();
  });

  it('renders the integrated trends page after auth restores', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-integrated-trends' }),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;

    render(
      <MemoryRouter initialEntries={['/trends']}>
        <App
          auth={auth}
          meals={createMealsRepository()}
          nutritionGoals={createNutritionGoalsRepository()}
          weight={createWeightRepository()}
          workouts={createWorkoutsRepository()}
        />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '综合趋势' })).toBeInTheDocument();
    expect(screen.getByText('趋势和建议均为估算，不构成医疗建议。')).toBeInTheDocument();
  });

  it('keeps the settings route behind the authenticated session and renders privacy controls', async () => {
    const auth: AuthPort = {
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
      currentUser: vi.fn().mockResolvedValue({ userId: 'user-settings' }),
      signOut: vi.fn().mockResolvedValue(undefined),
    } as AuthPort;

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App auth={auth} account={createAccountRepository()} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: '隐私与设置' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '清空我的应用数据' })).toBeDisabled();
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
