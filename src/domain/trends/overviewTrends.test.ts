import { describe, expect, it } from 'vitest';

import type { WeightEntry, WorkoutSession } from '@daily-record/contracts';
import {
  buildWeightTrend,
  buildWorkoutWeekTrend,
} from './overviewTrends';

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

function workoutSession(
  id: string,
  workoutDate: string,
  volumeKg: number,
  sets: Array<{ weightKg: number; reps: number; completed: boolean }>,
): WorkoutSession {
  return {
    id,
    workoutDate,
    bodyParts: ['胸'],
    durationMinutes: 60,
    note: '',
    volumeKg,
    exercises: [{
      id: `${id}-exercise`,
      name: '卧推',
      order: 1,
      sets: sets.map((set, index) => ({
        id: `${id}-set-${index + 1}`,
        order: index + 1,
        ...set,
      })),
    }],
    createdAt: `${workoutDate}T08:00:00.000Z`,
    updatedAt: `${workoutDate}T08:00:00.000Z`,
  };
}

describe('overviewTrends', () => {
  it('builds sorted weight points and only emits seven-entry averages when enough data exists', () => {
    const entries = [
      weightEntry('w3', '2026-07-03', 70.3),
      weightEntry('w1', '2026-07-01', 70.1),
      weightEntry('w7', '2026-07-07', 70.7),
      weightEntry('w2', '2026-07-02', 70.2),
      weightEntry('w4', '2026-07-04', 70.4),
      weightEntry('w5', '2026-07-05', 70.5),
      weightEntry('w6', '2026-07-06', 70.6),
      weightEntry('w8', '2026-07-08', 70.8),
    ];

    const result = buildWeightTrend(entries);

    expect(result.map((point) => point.date)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-04',
      '2026-07-05',
      '2026-07-06',
      '2026-07-07',
      '2026-07-08',
    ]);
    expect(result.slice(0, 6).map((point) => point.sevenDayAverageKg)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(result[6]).toMatchObject({
      date: '2026-07-07',
      weightKg: 70.7,
      sevenDayAverageKg: 70.4,
    });
    expect(result[7]).toMatchObject({
      date: '2026-07-08',
      weightKg: 70.8,
      sevenDayAverageKg: 70.5,
    });
  });

  it('does not mutate trend inputs', () => {
    const weights = [
      weightEntry('w2', '2026-07-02', 70.2),
      weightEntry('w1', '2026-07-01', 70.1),
    ];
    const workouts = [
      workoutSession('workout-2', '2026-07-08', 600, [{ weightKg: 100, reps: 6, completed: true }]),
      workoutSession('workout-1', '2026-07-01', 480, [{ weightKg: 60, reps: 8, completed: true }]),
    ];

    buildWeightTrend(weights);
    buildWorkoutWeekTrend({ startDate: '2026-07-01', endDate: '2026-07-14', workouts });

    expect(weights.map((entry) => entry.id)).toEqual(['w2', 'w1']);
    expect(workouts.map((workout) => workout.id)).toEqual(['workout-2', 'workout-1']);
  });

  it('builds workout weekly trend windows with session count, volume, and top completed set weight', () => {
    const result = buildWorkoutWeekTrend({
      startDate: '2026-07-01',
      endDate: '2026-07-14',
      workouts: [
        workoutSession('workout-2', '2026-07-03', 600, [
          { weightKg: 100, reps: 5, completed: false },
          { weightKg: 80, reps: 6, completed: true },
        ]),
        workoutSession('workout-1', '2026-07-01', 480, [
          { weightKg: 60, reps: 8, completed: true },
        ]),
        workoutSession('workout-3', '2026-07-09', 700, [
          { weightKg: 90, reps: 5, completed: true },
        ]),
      ],
    });

    expect(result).toEqual([
      {
        weekStartDate: '2026-07-01',
        weekEndDate: '2026-07-07',
        sessionCount: 2,
        volumeKg: 1080,
        topSetWeightKg: 80,
      },
      {
        weekStartDate: '2026-07-08',
        weekEndDate: '2026-07-14',
        sessionCount: 1,
        volumeKg: 700,
        topSetWeightKg: 90,
      },
    ]);
  });

  it('returns empty trends for empty input', () => {
    expect(buildWeightTrend([])).toEqual([]);
    expect(buildWorkoutWeekTrend({
      startDate: '2026-07-01',
      endDate: '2026-07-14',
      workouts: [],
    })).toEqual([]);
  });
});
