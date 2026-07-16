import { describe, expect, it } from 'vitest';

import { calculateWorkoutVolume } from './workoutVolume';

describe('calculateWorkoutVolume', () => {
  it('counts only completed sets', () => {
    expect(calculateWorkoutVolume({
      exercises: [{
        id: 'e1',
        name: '卧推',
        order: 1,
        sets: [
          { id: 's1', order: 1, weightKg: 60, reps: 8, completed: true },
          { id: 's2', order: 2, weightKg: 60, reps: 8, completed: false },
        ],
      }],
    })).toBe(480);
  });

  it('sums completed volume across exercises', () => {
    expect(calculateWorkoutVolume({
      exercises: [
        {
          id: 'e1',
          name: '深蹲',
          order: 1,
          sets: [
            { id: 's1', order: 1, weightKg: 100, reps: 5, completed: true },
            { id: 's2', order: 2, weightKg: 100, reps: 5, completed: true },
          ],
        },
        {
          id: 'e2',
          name: '硬拉',
          order: 2,
          sets: [
            { id: 's3', order: 1, weightKg: 120, reps: 3, completed: true },
          ],
        },
      ],
    })).toBe(1360);
  });
});
