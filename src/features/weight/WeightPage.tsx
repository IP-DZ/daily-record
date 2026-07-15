import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';

import type { WeightEntry } from '@daily-record/contracts';

import { calculateWeightFeedback } from '../../domain/weight';
import type { OfflineDraftRepository } from '../../platform/offline';
import type { WeightRepository } from '../../platform/weight';
import './weight.css';

type WeightPageProps = {
  weight: WeightRepository;
  initialDate?: string;
  draftRepository?: OfflineDraftRepository<WeightDraft>;
};

export const weightDraftSchema = z.object({
  selectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weightValue: z.string(),
  note: z.string(),
}).strict();

export type WeightDraft = z.infer<typeof weightDraftSchema>;

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

function average(entries: readonly WeightEntry[]): number | null {
  if (entries.length === 0) return null;
  return entries.reduce((sum, entry) => sum + entry.weightKg, 0) / entries.length;
}

function feedbackText(status: ReturnType<typeof calculateWeightFeedback>['status']): string {
  if (status === 'increase-calories') return '建议每日增加 100 kcal';
  if (status === 'decrease-calories') return '建议每日减少 100 kcal';
  if (status === 'maintain') return '当前热量先维持';
  return '数据还不够，先继续记录。';
}

export function WeightPage({ weight, initialDate = localDateString(), draftRepository }: WeightPageProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [weightValue, setWeightValue] = useState('');
  const [note, setNote] = useState('');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<WeightDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const loadToken = useRef(0);

  async function loadEntries(options: { keepOnFailure: boolean }) {
    const token = ++loadToken.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const loaded = await weight.listByDateRange(addDays(selectedDate, -60), selectedDate);
      if (loadToken.current !== token) return;
      setEntries(loaded);
    } catch {
      if (loadToken.current !== token) return;
      setErrorMessage(
        options.keepOnFailure
          ? '暂时无法加载体重记录，已保留当前列表。'
          : '暂时无法加载体重记录，可以稍后重试。',
      );
      if (!options.keepOnFailure) setEntries([]);
    } finally {
      if (loadToken.current === token) setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadEntries({ keepOnFailure: entries.length > 0 });
  }, [weight, selectedDate]);

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
    if (draftRepository === undefined || editingEntryId !== null) return;
    if (weightValue.trim() === '' && note.trim() === '') return;

    void draftRepository.save({ selectedDate, weightValue, note }).catch(() => {});
  }, [draftRepository, editingEntryId, note, selectedDate, weightValue]);

  const latestEntries = useMemo(
    () => [...entries].sort((a, b) => b.entryDate.localeCompare(a.entryDate)).slice(0, 7),
    [entries],
  );
  const latestWeight = latestEntries[0]?.weightKg ?? null;
  const sevenDayAverage = average(latestEntries);
  const feedback = latestWeight === null
    ? null
    : calculateWeightFeedback(entries, latestWeight);

  function resetForm() {
    setEditingEntryId(null);
    setWeightValue('');
    setNote('');
  }

  function restoreDraft(draft: WeightDraft) {
    setSelectedDate(draft.selectedDate);
    setEditingEntryId(null);
    setWeightValue(draft.weightValue);
    setNote(draft.note);
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

  function startEdit(entry: WeightEntry) {
    setEditingEntryId(entry.id);
    setSelectedDate(entry.entryDate);
    setWeightValue(String(entry.weightKg));
    setNote(entry.note);
    setStatusMessage(`正在编辑 ${formatNumber(entry.weightKg)} kg`);
    setErrorMessage(null);
  }

  async function saveWeight() {
    if (isSaving) return;
    const parsedWeight = Number(weightValue);
    if (!Number.isFinite(parsedWeight) || parsedWeight < 30 || parsedWeight > 350) {
      setErrorMessage('请输入 30 到 350 千克之间的体重。');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      if (editingEntryId === null) {
        await weight.create({
          entryDate: selectedDate,
          weightKg: parsedWeight,
          note: note.trim(),
        });
        setStatusMessage('体重已保存。');
      } else {
        await weight.update({
          id: editingEntryId,
          entryDate: selectedDate,
          weightKg: parsedWeight,
          note: note.trim(),
        });
        setStatusMessage('修改已保存。');
      }
      resetForm();
      try {
        await draftRepository?.clear();
      } catch {
        // 保存已成功，本地草稿清理失败不应回滚用户数据。
      }
      await loadEntries({ keepOnFailure: true });
    } catch {
      setErrorMessage('保存失败，当前列表已保留。');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteEntry(entry: WeightEntry) {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await weight.delete(entry.id);
      if (editingEntryId === entry.id) resetForm();
      setStatusMessage(`${formatNumber(entry.weightKg)} kg 已删除。`);
      await loadEntries({ keepOnFailure: true });
    } catch {
      setErrorMessage('删除失败，当前列表已保留。');
    }
  }

  return (
    <main className="weight-page">
      <header className="weight-header">
        <p className="weight-eyebrow">体重与反馈</p>
        <h1>记录体重变化</h1>
        <p>热量调整建议是基于体重趋势的估算，不构成医疗建议。</p>
      </header>

      <section className="weight-panel" aria-label="体重趋势概览">
        <div>
          <p>7 日均重</p>
          <strong>{sevenDayAverage === null ? '暂无' : `${formatNumber(sevenDayAverage)} kg`}</strong>
        </div>
        <div>
          <p>反馈</p>
          <strong>{feedbackText(feedback?.status ?? 'insufficient-data')}</strong>
          {feedback !== null && feedback.status !== 'insufficient-data' && (
            <span>每周变化约 {formatNumber(feedback.weeklyChangeKg ?? 0)} kg</span>
          )}
        </div>
        <p className="weight-note">此建议只是估算，不会自动修改你的营养目标。</p>
      </section>

      {isLoading && <p role="status" className="weight-message">正在加载体重记录…</p>}
      {statusMessage && <p role="status" className="weight-message">{statusMessage}</p>}
      {errorMessage && <p role="alert" className="weight-error">{errorMessage}</p>}
      {pendingDraft !== null && (
        <section className="weight-message" role="status" aria-label="未提交草稿">
          <p>发现未提交草稿</p>
          <div className="weight-form-actions">
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
        className="weight-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void saveWeight();
        }}
      >
        <h2>{editingEntryId === null ? '新增体重' : '编辑体重'}</h2>
        <label>
          日期
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => {
              setSelectedDate(event.target.value);
              if (editingEntryId !== null) resetForm();
            }}
          />
        </label>
        <label>
          体重（千克）
          <input
            type="number"
            inputMode="decimal"
            min="30"
            max="350"
            value={weightValue}
            onChange={(event) => setWeightValue(event.target.value)}
          />
        </label>
        <label>
          备注
          <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：晨重" />
        </label>
        <div className="weight-form-actions">
          <button type="submit" disabled={isSaving}>
            {editingEntryId === null ? '保存体重' : '保存修改'}
          </button>
          {editingEntryId !== null && (
            <button type="button" className="secondary-action" onClick={resetForm}>
              取消编辑
            </button>
          )}
        </div>
      </form>

      <section className="weight-list" aria-label="体重列表">
        <h2>最近记录</h2>
        {entries.length === 0 ? (
          <p className="weight-empty">还没有记录体重。</p>
        ) : (
          <div className="weight-cards">
            {latestEntries.map((entry) => (
              <article key={entry.id} className="weight-card" aria-label={`${formatNumber(entry.weightKg)} kg`}>
                <div>
                  <h3>{formatNumber(entry.weightKg)} kg</h3>
                  <p>{entry.entryDate}</p>
                  {entry.note !== '' && <p>{entry.note}</p>}
                </div>
                <div className="weight-card-actions">
                  <button type="button" onClick={() => startEdit(entry)}>
                    编辑{formatNumber(entry.weightKg)} kg
                  </button>
                  <button type="button" className="danger-action" onClick={() => void deleteEntry(entry)}>
                    删除{formatNumber(entry.weightKg)} kg
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
