import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';

import type { WorkoutSession } from '@daily-record/contracts';

import { calculateWorkoutVolume } from '../../domain/workouts';
import type { OfflineDraftRepository } from '../../platform/offline';
import type { WorkoutsRepository } from '../../platform/workouts';
import './workouts.css';

type WorkoutsPageProps = {
  workouts: WorkoutsRepository;
  initialDate?: string;
  draftRepository?: OfflineDraftRepository<WorkoutDraft>;
};

export const workoutDraftSchema = z.object({
  selectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  bodyParts: z.string(),
  durationMinutes: z.string(),
  exerciseName: z.string(),
  weightKg: z.string(),
  reps: z.string(),
  completed: z.boolean(),
}).strict();

export type WorkoutDraft = z.infer<typeof workoutDraftSchema>;

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(dateString: string, days: number): string {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function splitBodyParts(value: string): string[] {
  return value
    .split(/[，,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function titleForWorkout(workout: WorkoutSession): string {
  const parts = workout.bodyParts.join('、');
  const duration = workout.durationMinutes === null ? '未记录时长' : `${workout.durationMinutes} 分钟`;
  return `${parts} · ${duration}`;
}

export function WorkoutsPage({ workouts, initialDate = localDateString(), draftRepository }: WorkoutsPageProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [bodyParts, setBodyParts] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [exerciseName, setExerciseName] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [reps, setReps] = useState('');
  const [completed, setCompleted] = useState(true);
  const [workoutList, setWorkoutList] = useState<WorkoutSession[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<WorkoutDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const loadToken = useRef(0);

  async function loadWorkouts(options: { keepOnFailure: boolean }) {
    const token = ++loadToken.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const loaded = await workouts.listByDateRange(addDays(selectedDate, -60), addDays(selectedDate, 60));
      if (loadToken.current !== token) return;
      setWorkoutList(loaded);
    } catch {
      if (loadToken.current !== token) return;
      setErrorMessage(
        options.keepOnFailure
          ? '暂时无法加载训练记录，已保留当前列表。'
          : '暂时无法加载训练记录，可以稍后重试。',
      );
      if (!options.keepOnFailure) setWorkoutList([]);
    } finally {
      if (loadToken.current === token) setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadWorkouts({ keepOnFailure: workoutList.length > 0 });
  }, [workouts, selectedDate]);

  useEffect(() => {
    let active = true;
    if (draftRepository === undefined) return undefined;

    void draftRepository.load()
      .then((draft) => {
        if (active) setPendingDraft(draft);
      })
      .catch(() => {
        if (active) setPendingDraft(null);
      });

    return () => {
      active = false;
    };
  }, [draftRepository]);

  useEffect(() => {
    if (draftRepository === undefined) return;
    const hasDraftContent = [bodyParts, durationMinutes, exerciseName, weightKg, reps]
      .some((value) => value.trim() !== '')
      || !completed;
    if (!hasDraftContent) return;

    void draftRepository.save({
      selectedDate,
      bodyParts,
      durationMinutes,
      exerciseName,
      weightKg,
      reps,
      completed,
    }).catch(() => {});
  }, [bodyParts, completed, draftRepository, durationMinutes, exerciseName, reps, selectedDate, weightKg]);

  function resetForm() {
    setBodyParts('');
    setDurationMinutes('');
    setExerciseName('');
    setWeightKg('');
    setReps('');
    setCompleted(true);
  }

  function restoreDraft(draft: WorkoutDraft) {
    setSelectedDate(draft.selectedDate);
    setBodyParts(draft.bodyParts);
    setDurationMinutes(draft.durationMinutes);
    setExerciseName(draft.exerciseName);
    setWeightKg(draft.weightKg);
    setReps(draft.reps);
    setCompleted(draft.completed);
    setPendingDraft(null);
    setStatusMessage('草稿已恢复，请确认后保存。');
    setErrorMessage(null);
  }

  async function discardDraft() {
    try {
      await draftRepository?.clear();
    } catch {
      // 本地草稿只是便利功能，清除失败不阻断主表单。
    }
    setPendingDraft(null);
  }

  async function saveWorkout() {
    if (isSaving) return;
    const parsedBodyParts = splitBodyParts(bodyParts);
    const parsedDuration = durationMinutes.trim() === '' ? null : Number(durationMinutes);
    const parsedWeight = Number(weightKg);
    const parsedReps = Number(reps);
    if (
      parsedBodyParts.length === 0
      || exerciseName.trim() === ''
      || (parsedDuration !== null && (!Number.isInteger(parsedDuration) || parsedDuration < 0 || parsedDuration > 600))
      || !Number.isFinite(parsedWeight)
      || parsedWeight < 0
      || !Number.isInteger(parsedReps)
      || parsedReps < 0
    ) {
      setErrorMessage('请完整填写训练部位、动作、重量和次数。');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await workouts.create({
        workoutDate: selectedDate,
        bodyParts: parsedBodyParts,
        durationMinutes: parsedDuration,
        note: '',
        exercises: [{
          id: 'exercise-form-1',
          name: exerciseName.trim(),
          order: 1,
          sets: [{
            id: 'set-form-1',
            order: 1,
            weightKg: parsedWeight,
            reps: parsedReps,
            completed,
          }],
        }],
      });
      resetForm();
      try {
        await draftRepository?.clear();
      } catch {
        // 保存已成功，本地草稿清理失败不应回滚用户数据。
      }
      setStatusMessage('训练已保存。');
      await loadWorkouts({ keepOnFailure: true });
    } catch {
      setErrorMessage('保存失败，当前列表已保留。');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteWorkout(workout: WorkoutSession) {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await workouts.delete(workout.id);
      setStatusMessage('训练已删除。');
      await loadWorkouts({ keepOnFailure: true });
    } catch {
      setErrorMessage('删除失败，当前列表已保留。');
    }
  }

  async function copyLatestWorkout() {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await workouts.copyLatest(selectedDate);
      setStatusMessage('已复制上次训练。');
      await loadWorkouts({ keepOnFailure: true });
    } catch {
      setErrorMessage('复制失败，当前列表已保留。');
    }
  }

  return (
    <main className="workouts-page">
      <header className="workouts-header">
        <p className="workouts-eyebrow">训练记录</p>
        <h1>记录力量训练</h1>
        <p>记录训练部位、动作和已完成组，训练容量只统计已完成组。</p>
      </header>

      {isLoading && <p role="status" className="workouts-message">正在加载训练记录…</p>}
      {statusMessage && <p role="status" className="workouts-message">{statusMessage}</p>}
      {errorMessage && <p role="alert" className="workouts-error">{errorMessage}</p>}
      {pendingDraft !== null && (
        <section className="workouts-message" role="status" aria-label="未提交草稿">
          <p>发现未提交草稿</p>
          <div className="workouts-form-actions">
            <button type="button" onClick={() => restoreDraft(pendingDraft)}>
              恢复草稿
            </button>
            <button type="button" className="secondary-action" onClick={() => void discardDraft()}>
              丢弃草稿
            </button>
          </div>
        </section>
      )}

      <form
        className="workouts-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void saveWorkout();
        }}
      >
        <h2>新增训练</h2>
        <label>
          日期
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} />
        </label>
        <label>
          训练部位
          <input value={bodyParts} onChange={(event) => setBodyParts(event.target.value)} placeholder="例如：胸，三头" />
        </label>
        <label>
          时长（分钟）
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="600"
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
          />
        </label>
        <label>
          动作名称
          <input value={exerciseName} onChange={(event) => setExerciseName(event.target.value)} placeholder="例如：卧推" />
        </label>
        <div className="workouts-set-grid">
          <label>
            重量（千克）
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={weightKg}
              onChange={(event) => setWeightKg(event.target.value)}
            />
          </label>
          <label>
            次数
            <input
              type="number"
              inputMode="numeric"
              min="0"
              value={reps}
              onChange={(event) => setReps(event.target.value)}
            />
          </label>
        </div>
        <label className="workouts-checkbox">
          <input type="checkbox" checked={completed} onChange={(event) => setCompleted(event.target.checked)} />
          已完成
        </label>
        <div className="workouts-form-actions">
          <button type="submit" disabled={isSaving}>保存训练</button>
          <button type="button" className="secondary-action" onClick={() => void copyLatestWorkout()}>
            复制上次训练
          </button>
        </div>
      </form>

      <section className="workouts-list" aria-label="训练列表">
        <h2>训练列表</h2>
        {workoutList.length === 0 ? (
          <p className="workouts-empty">还没有记录训练。</p>
        ) : (
          <div className="workouts-cards">
            {workoutList.map((workout) => (
              <article key={workout.id} className="workout-card" aria-label={titleForWorkout(workout)}>
                <div>
                  <h3>{titleForWorkout(workout)}</h3>
                  <p>{workout.workoutDate}</p>
                  <p>训练容量 {formatNumber(calculateWorkoutVolume(workout))} kg</p>
                  {workout.exercises.map((exercise) => (
                    <p key={exercise.id}>
                      {exercise.name} · {formatNumber(exercise.sets[0]?.weightKg ?? 0)} kg × {exercise.sets[0]?.reps ?? 0}
                    </p>
                  ))}
                </div>
                <div className="workout-card-actions">
                  <button type="button" onClick={() => void copyLatestWorkout()}>
                    复制上次训练
                  </button>
                  <button type="button" className="danger-action" onClick={() => void deleteWorkout(workout)}>
                    删除训练
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
