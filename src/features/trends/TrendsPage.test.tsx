import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  MealNutritionTotals,
  NutritionGoalVersion,
  WeightEntry,
  WorkoutSession,
} from '@daily-record/contracts';
import type { MealsRepository } from '../../platform/meals';
import type { NutritionGoalsRepository } from '../../platform/nutritionGoals';
import type { WeightRepository } from '../../platform/weight';
import type { WorkoutsRepository } from '../../platform/workouts';
import { TrendsPage } from './TrendsPage';

const zeroTotals: MealNutritionTotals = {
  caloriesKcal: 0,
  proteinGrams: 0,
  fatGrams: 0,
  carbsGrams: 0,
};

function mealsRepository(days: Record<string, MealNutritionTotals>): MealsRepository {
  return {
    listByDate: vi.fn(async (date: string) => ({
      meals: [],
      totals: days[date] ?? zeroTotals,
    })),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    copy: vi.fn(),
  } as MealsRepository;
}

function nutritionGoalsRepository(goals: NutritionGoalVersion[]): NutritionGoalsRepository {
  return {
    listByDateRange: vi.fn().mockResolvedValue(goals),
  };
}

function weightRepository(entries: WeightEntry[]): WeightRepository {
  return {
    listByDateRange: vi.fn().mockResolvedValue(entries),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  } as WeightRepository;
}

function workoutsRepository(sessions: WorkoutSession[]): WorkoutsRepository {
  return {
    listByDateRange: vi.fn().mockResolvedValue(sessions),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    copyLatest: vi.fn(),
  } as WorkoutsRepository;
}

function weightEntry(id: string, entryDate: string, weightKg: number): WeightEntry {
  return {
    id,
    entryDate,
    weightKg,
    note: '',
    createdAt: `${entryDate}T08:00:00.000Z`,
    updatedAt: `${entryDate}T08:00:00.000Z`,
  };
}

function workoutSession(id: string, workoutDate: string): WorkoutSession {
  return {
    id,
    workoutDate,
    bodyParts: ['胸'],
    durationMinutes: 60,
    note: '',
    volumeKg: 480,
    exercises: [{
      id: `${id}-exercise`,
      name: '卧推',
      order: 1,
      sets: [{
        id: `${id}-set`,
        order: 1,
        weightKg: 60,
        reps: 8,
        completed: true,
      }],
    }],
    createdAt: `${workoutDate}T08:00:00.000Z`,
    updatedAt: `${workoutDate}T08:00:00.000Z`,
  };
}

const goals: NutritionGoalVersion[] = [{
  version: 1,
  effectiveDate: '2026-06-01',
  targets: {
    restingKcal: 1700,
    maintenanceKcal: 2600,
    caloriesKcal: 2860,
    proteinGrams: 140,
    fatGrams: 79,
    carbsGrams: 390,
  },
  createdAt: '2026-06-01T08:00:00.000Z',
}];

describe('TrendsPage', () => {
  afterEach(() => cleanup());

  it('loads a 28-day overview and switches nutrition, weight, and workout trend sections', async () => {
    const meals = mealsRepository({
      '2026-07-14': {
        caloriesKcal: 1430,
        proteinGrams: 70,
        fatGrams: 39.5,
        carbsGrams: 195,
      },
    });
    const nutritionGoals = nutritionGoalsRepository(goals);
    const weight = weightRepository([
      weightEntry('w1', '2026-07-08', 70.1),
      weightEntry('w2', '2026-07-09', 70.2),
      weightEntry('w3', '2026-07-10', 70.3),
      weightEntry('w4', '2026-07-11', 70.4),
      weightEntry('w5', '2026-07-12', 70.5),
      weightEntry('w6', '2026-07-13', 70.6),
      weightEntry('w7', '2026-07-14', 70.7),
    ]);
    const workouts = workoutsRepository([workoutSession('workout-1', '2026-07-14')]);

    render(
      <TrendsPage
        meals={meals}
        nutritionGoals={nutritionGoals}
        weight={weight}
        workouts={workouts}
        initialEndDate="2026-07-14"
      />,
    );

    expect(await screen.findByRole('heading', { name: '综合趋势' })).toBeInTheDocument();
    expect(screen.getByText('趋势和建议均为估算，不构成医疗建议。')).toBeInTheDocument();

    await waitFor(() => {
      expect(nutritionGoals.listByDateRange).toHaveBeenCalledWith('2026-06-17', '2026-07-14');
    });
    expect(meals.listByDate).toHaveBeenCalledTimes(28);
    expect(weight.listByDateRange).toHaveBeenCalledWith('2026-06-17', '2026-07-14');
    expect(workouts.listByDateRange).toHaveBeenCalledWith('2026-06-17', '2026-07-14');

    const nutritionPanel = screen.getByLabelText('营养趋势概览');
    expect(within(nutritionPanel).getByText('1430 / 20020 kcal')).toBeInTheDocument();
    expect(within(nutritionPanel).getByText('7%')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '体重' }));
    const weightPanel = screen.getByLabelText('体重趋势概览');
    expect(within(weightPanel).getAllByText('70.7 kg')[0]).toBeInTheDocument();
    expect(within(weightPanel).getAllByText('70.4 kg')[0]).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '训练' }));
    const workoutsPanel = screen.getByLabelText('训练趋势概览');
    expect(within(workoutsPanel).getByText('2026-07-08 至 2026-07-14')).toBeInTheDocument();
    expect(within(workoutsPanel).getByText('1 次')).toBeInTheDocument();
    expect(within(workoutsPanel).getByText('480 kg')).toBeInTheDocument();
    expect(within(workoutsPanel).getByText('60 kg')).toBeInTheDocument();
  });

  it('shows understandable empty states without pretending trends exist', async () => {
    render(
      <TrendsPage
        meals={mealsRepository({})}
        nutritionGoals={nutritionGoalsRepository([])}
        weight={weightRepository([])}
        workouts={workoutsRepository([])}
        initialEndDate="2026-07-14"
      />,
    );

    expect(await screen.findByText('暂无营养目标。')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '体重' }));
    expect(screen.getByText('还没有足够的体重记录。')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '训练' }));
    expect(screen.getByText('还没有训练记录。')).toBeInTheDocument();
  });
});
