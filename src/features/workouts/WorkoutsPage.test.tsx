import type { CreateWorkoutInput, UpdateWorkoutInput, WorkoutSession } from '@daily-record/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { calculateWorkoutVolume } from '../../domain/workouts';
import type { WorkoutsRepository } from '../../platform/workouts';
import { WorkoutsPage } from './WorkoutsPage';

const today = '2026-07-14';

function session(id: string, input: CreateWorkoutInput): WorkoutSession {
  return {
    id,
    ...input,
    note: input.note ?? '',
    volumeKg: calculateWorkoutVolume(input),
    createdAt: '2026-07-14T00:00:00.000Z',
    updatedAt: '2026-07-14T00:00:00.000Z',
  };
}

function workoutInput(name = '卧推', completed = true): CreateWorkoutInput {
  return {
    workoutDate: today,
    bodyParts: ['胸'],
    durationMinutes: 60,
    note: '',
    exercises: [{
      id: `${name}-exercise`,
      name,
      order: 1,
      sets: [
        { id: `${name}-set`, order: 1, weightKg: 60, reps: 8, completed },
      ],
    }],
  };
}

function createMemoryWorkoutsRepository(initialSessions: WorkoutSession[] = []): WorkoutsRepository {
  const sessions = [...initialSessions];
  let nextId = 1;

  return {
    async listByDateRange(startDate: string, endDate: string): Promise<WorkoutSession[]> {
      return sessions
        .filter((item) => item.workoutDate >= startDate && item.workoutDate <= endDate)
        .sort((a, b) => a.workoutDate.localeCompare(b.workoutDate));
    },
    async create(input: CreateWorkoutInput): Promise<WorkoutSession> {
      const created = session(`workout-${nextId++}`, input);
      sessions.push(created);
      return created;
    },
    async update(input: UpdateWorkoutInput): Promise<WorkoutSession> {
      const index = sessions.findIndex((item) => item.id === input.id);
      if (index < 0) throw new Error('missing');
      const updated = session(input.id, input);
      sessions[index] = updated;
      return updated;
    },
    async delete(id: string): Promise<void> {
      const index = sessions.findIndex((item) => item.id === id);
      if (index < 0) throw new Error('missing');
      sessions.splice(index, 1);
    },
    async copyLatest(targetDate: string): Promise<WorkoutSession> {
      const latest = [...sessions].sort((a, b) => b.workoutDate.localeCompare(a.workoutDate))[0];
      if (latest === undefined) throw new Error('missing');
      const copied = session(`workout-${nextId++}`, {
        workoutDate: targetDate,
        bodyParts: latest.bodyParts,
        durationMinutes: latest.durationMinutes,
        note: latest.note,
        exercises: latest.exercises.map((exercise, exerciseIndex) => ({
          ...exercise,
          id: `copied-exercise-${nextId}-${exerciseIndex}`,
          sets: exercise.sets.map((set, setIndex) => ({
            ...set,
            id: `copied-set-${nextId}-${exerciseIndex}-${setIndex}`,
          })),
        })),
      });
      sessions.push(copied);
      return copied;
    },
  };
}

function createMemoryDraftRepository<TDraft>(initialDraft: TDraft | null) {
  let draft = initialDraft;
  return {
    save: vi.fn(async (nextDraft: TDraft) => {
      draft = nextDraft;
    }),
    load: vi.fn(async () => draft),
    clear: vi.fn(async () => {
      draft = null;
    }),
  };
}

async function fillWorkoutForm(user: ReturnType<typeof userEvent.setup>, values: {
  bodyParts: string;
  durationMinutes: string;
  exerciseName: string;
  weightKg: string;
  reps: string;
  completed: boolean;
}) {
  await user.clear(screen.getByLabelText('训练部位'));
  await user.type(screen.getByLabelText('训练部位'), values.bodyParts);
  await user.clear(screen.getByLabelText('时长（分钟）'));
  await user.type(screen.getByLabelText('时长（分钟）'), values.durationMinutes);
  await user.clear(screen.getByLabelText('动作名称'));
  await user.type(screen.getByLabelText('动作名称'), values.exerciseName);
  await user.clear(screen.getByLabelText('重量（千克）'));
  await user.type(screen.getByLabelText('重量（千克）'), values.weightKg);
  await user.clear(screen.getByLabelText('次数'));
  await user.type(screen.getByLabelText('次数'), values.reps);
  const checkbox = screen.getByLabelText('已完成');
  if (checkbox instanceof HTMLInputElement && checkbox.checked !== values.completed) {
    await user.click(checkbox);
  }
}

afterEach(cleanup);

describe('WorkoutsPage', () => {
  it('adds a workout and shows completed-set volume', async () => {
    const user = userEvent.setup();
    render(<WorkoutsPage workouts={createMemoryWorkoutsRepository()} initialDate={today} />);

    await fillWorkoutForm(user, {
      bodyParts: '胸',
      durationMinutes: '60',
      exerciseName: '卧推',
      weightKg: '60',
      reps: '8',
      completed: true,
    });
    await user.click(screen.getByRole('button', { name: '保存训练' }));

    expect(await screen.findByRole('heading', { name: '胸 · 60 分钟' })).toBeInTheDocument();
    expect(screen.getByText('训练容量 480 kg')).toBeInTheDocument();
    expect(screen.getByText('卧推 · 60 kg × 8')).toBeInTheDocument();
  });

  it('does not count unfinished sets toward volume', async () => {
    const user = userEvent.setup();
    render(<WorkoutsPage workouts={createMemoryWorkoutsRepository()} initialDate={today} />);

    await fillWorkoutForm(user, {
      bodyParts: '背',
      durationMinutes: '45',
      exerciseName: '划船',
      weightKg: '70',
      reps: '10',
      completed: false,
    });
    await user.click(screen.getByRole('button', { name: '保存训练' }));

    expect(await screen.findByRole('heading', { name: '背 · 45 分钟' })).toBeInTheDocument();
    expect(screen.getByText('训练容量 0 kg')).toBeInTheDocument();
  });

  it('derives displayed volume from completed sets instead of trusting stored totals', async () => {
    const repository = createMemoryWorkoutsRepository([
      {
        ...session('workout-existing', workoutInput('卧推', true)),
        volumeKg: 9999,
      },
    ]);

    render(<WorkoutsPage workouts={repository} initialDate={today} />);

    expect(await screen.findByText('训练容量 480 kg')).toBeInTheDocument();
    expect(screen.queryByText('训练容量 9999 kg')).not.toBeInTheDocument();
  });

  it('deletes and copies workouts', async () => {
    const user = userEvent.setup();
    const repository = createMemoryWorkoutsRepository([session('workout-existing', workoutInput('卧推'))]);
    const copiedSessions: WorkoutSession[] = [];
    const originalCopyLatest = repository.copyLatest.bind(repository);
    repository.copyLatest = async (targetDate: string) => {
      const copied = await originalCopyLatest(targetDate);
      copiedSessions.push(copied);
      return copied;
    };
    render(<WorkoutsPage workouts={repository} initialDate={today} />);

    const card = await screen.findByRole('article', { name: '胸 · 60 分钟' });
    await user.clear(screen.getByLabelText('日期'));
    await user.type(screen.getByLabelText('日期'), '2026-07-15');
    await user.click(within(card).getByRole('button', { name: '复制上次训练' }));
    expect(await screen.findAllByRole('heading', { name: '胸 · 60 分钟' })).toHaveLength(2);
    expect(copiedSessions[0]).toMatchObject({
      id: expect.not.stringMatching(/^workout-existing$/),
      workoutDate: '2026-07-15',
    });
    expect(screen.getByText('2026-07-15')).toBeInTheDocument();

    const firstCard = screen.getAllByRole('article', { name: '胸 · 60 分钟' })[0];
    await user.click(within(firstCard).getByRole('button', { name: '删除训练' }));
    expect(await screen.findAllByRole('heading', { name: '胸 · 60 分钟' })).toHaveLength(1);
  });

  it('lets the user discard an unsubmitted workout draft', async () => {
    const user = userEvent.setup();
    const draftRepository = createMemoryDraftRepository({
      selectedDate: today,
      bodyParts: '背',
      durationMinutes: '45',
      exerciseName: '划船',
      weightKg: '70',
      reps: '10',
      completed: false,
    });

    render(
      <WorkoutsPage
        workouts={createMemoryWorkoutsRepository()}
        initialDate={today}
        {...({ draftRepository } as unknown as Record<string, unknown>)}
      />,
    );

    expect(await screen.findByText('发现未提交草稿')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '丢弃草稿' }));

    await waitFor(() => expect(draftRepository.clear).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('发现未提交草稿')).not.toBeInTheDocument();
    expect(screen.getByLabelText('训练部位')).toHaveValue('');
    expect(screen.getByLabelText('动作名称')).toHaveValue('');
  });
});
