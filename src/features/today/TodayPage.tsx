import { useEffect, useMemo, useRef, useState } from 'react';

import type { MealEntry, MealNutritionTotals } from '@daily-record/contracts';

import type { MealsRepository } from '../../platform/meals';
import './today.css';

type TodayPageProps = {
  meals: MealsRepository;
  initialDate?: string;
};

type MealFormValues = {
  name: string;
  amount: string;
  caloriesKcal: string;
  proteinGrams: string;
  fatGrams: string;
  carbsGrams: string;
};

const emptyTotals: MealNutritionTotals = {
  caloriesKcal: 0,
  proteinGrams: 0,
  fatGrams: 0,
  carbsGrams: 0,
};

const emptyForm: MealFormValues = {
  name: '',
  amount: '',
  caloriesKcal: '',
  proteinGrams: '',
  fatGrams: '',
  carbsGrams: '',
};

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(value);
}

function valuesFromMeal(meal: MealEntry): MealFormValues {
  return {
    name: meal.name,
    amount: meal.amount,
    caloriesKcal: String(meal.nutrition.caloriesKcal),
    proteinGrams: String(meal.nutrition.proteinGrams),
    fatGrams: String(meal.nutrition.fatGrams),
    carbsGrams: String(meal.nutrition.carbsGrams),
  };
}

function toNumber(value: string) {
  return value.trim() === '' ? Number.NaN : Number(value);
}

function buildNutrition(values: MealFormValues): MealNutritionTotals {
  return {
    caloriesKcal: toNumber(values.caloriesKcal),
    proteinGrams: toNumber(values.proteinGrams),
    fatGrams: toNumber(values.fatGrams),
    carbsGrams: toNumber(values.carbsGrams),
  };
}

function isValidNutrition(totals: MealNutritionTotals) {
  return Object.values(totals).every((value) => Number.isFinite(value) && value >= 0);
}

export function TodayPage({ meals, initialDate = localDateString() }: TodayPageProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [mealList, setMealList] = useState<MealEntry[]>([]);
  const [totals, setTotals] = useState<MealNutritionTotals>(emptyTotals);
  const [formValues, setFormValues] = useState<MealFormValues>(emptyForm);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const loadToken = useRef(0);

  async function loadDate(mealDate: string, options: { keepOnFailure: boolean }) {
    const token = ++loadToken.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const next = await meals.listByDate(mealDate);
      if (loadToken.current !== token) return;
      setMealList(next.meals);
      setTotals(next.totals);
    } catch {
      if (loadToken.current !== token) return;
      setErrorMessage(
        options.keepOnFailure
          ? '暂时无法加载这一天的餐食，已保留当前列表。'
          : '暂时无法加载餐食，可以稍后重试。',
      );
      if (!options.keepOnFailure) {
        setMealList([]);
        setTotals(emptyTotals);
      }
    } finally {
      if (loadToken.current === token) setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDate(selectedDate, { keepOnFailure: mealList.length > 0 });
  }, [meals, selectedDate]);

  const editingMeal = useMemo(
    () => mealList.find((meal) => meal.id === editingMealId) ?? null,
    [editingMealId, mealList],
  );

  function updateForm(field: keyof MealFormValues, value: string) {
    setFormValues((current) => ({ ...current, [field]: value }));
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function startEdit(meal: MealEntry) {
    setEditingMealId(meal.id);
    setFormValues(valuesFromMeal(meal));
    setStatusMessage(`正在编辑 ${meal.name}`);
    setErrorMessage(null);
  }

  function resetForm() {
    setEditingMealId(null);
    setFormValues(emptyForm);
  }

  async function saveMeal() {
    if (isSaving) return;
    const nutrition = buildNutrition(formValues);
    if (formValues.name.trim() === '' || formValues.amount.trim() === '' || !isValidNutrition(nutrition)) {
      setErrorMessage('请完整填写餐食名称、份量和非负营养数值。');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      if (editingMealId === null) {
        await meals.create({
          mealDate: selectedDate,
          name: formValues.name.trim(),
          amount: formValues.amount.trim(),
          nutrition,
        });
        setStatusMessage('餐食已保存。');
      } else {
        const sourceDate = editingMeal?.mealDate ?? selectedDate;
        await meals.update({
          id: editingMealId,
          mealDate: sourceDate,
          name: formValues.name.trim(),
          amount: formValues.amount.trim(),
          nutrition,
        });
        setStatusMessage('修改已保存。');
      }
      resetForm();
      await loadDate(selectedDate, { keepOnFailure: true });
    } catch {
      setErrorMessage('保存失败，当前列表已保留。');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteMeal(meal: MealEntry) {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await meals.delete(meal.id);
      if (editingMealId === meal.id) resetForm();
      setStatusMessage(`${meal.name} 已删除。`);
      await loadDate(selectedDate, { keepOnFailure: true });
    } catch {
      setErrorMessage('删除失败，当前列表已保留。');
    }
  }

  async function copyMeal(meal: MealEntry) {
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await meals.copy(meal.id, selectedDate);
      setStatusMessage(`${meal.name} 已复制到当前日期。`);
      await loadDate(selectedDate, { keepOnFailure: true });
    } catch {
      setErrorMessage('复制失败，当前列表已保留。');
    }
  }

  return (
    <main className="today-page">
      <header className="today-header">
        <p className="today-eyebrow">饮食记录工具</p>
        <h1>今天吃了什么？</h1>
        <p>这里的营养结果是可编辑估算，不构成医疗建议。</p>
      </header>

      <section className="today-panel" aria-label="日期和汇总">
        <label className="today-date">
          日期
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => {
              setSelectedDate(event.target.value);
              resetForm();
              setStatusMessage(null);
            }}
          />
        </label>

        <div className="today-totals" aria-label="当日合计">
          <p>总热量 {formatNumber(totals.caloriesKcal)} kcal</p>
          <p>蛋白质 {formatNumber(totals.proteinGrams)} g</p>
          <p>脂肪 {formatNumber(totals.fatGrams)} g</p>
          <p>碳水 {formatNumber(totals.carbsGrams)} g</p>
        </div>
      </section>

      {isLoading && <p role="status" className="today-message">正在加载餐食…</p>}
      {statusMessage && <p role="status" className="today-message">{statusMessage}</p>}
      {errorMessage && <p role="alert" className="today-error">{errorMessage}</p>}

      <form
        className="today-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void saveMeal();
        }}
      >
        <h2>{editingMealId === null ? '手动新增餐食' : '编辑餐食'}</h2>
        <label>
          餐食名称
          <input
            value={formValues.name}
            onChange={(event) => updateForm('name', event.target.value)}
            placeholder="例如：鸡胸饭"
          />
        </label>
        <label>
          份量
          <input
            value={formValues.amount}
            onChange={(event) => updateForm('amount', event.target.value)}
            placeholder="例如：1份"
          />
        </label>
        <div className="today-nutrition-grid">
          <label>
            热量
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={formValues.caloriesKcal}
              onChange={(event) => updateForm('caloriesKcal', event.target.value)}
            />
          </label>
          <label>
            蛋白质
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={formValues.proteinGrams}
              onChange={(event) => updateForm('proteinGrams', event.target.value)}
            />
          </label>
          <label>
            脂肪
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={formValues.fatGrams}
              onChange={(event) => updateForm('fatGrams', event.target.value)}
            />
          </label>
          <label>
            碳水
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={formValues.carbsGrams}
              onChange={(event) => updateForm('carbsGrams', event.target.value)}
            />
          </label>
        </div>
        <div className="today-form-actions">
          <button type="submit" disabled={isSaving}>
            {editingMealId === null ? '保存餐食' : '保存修改'}
          </button>
          {editingMealId !== null && (
            <button type="button" className="secondary-action" onClick={resetForm}>
              取消编辑
            </button>
          )}
        </div>
      </form>

      <section className="today-list" aria-label="餐食列表">
        <h2>餐食列表</h2>
        {mealList.length === 0 ? (
          <p className="today-empty">还没有记录餐食。</p>
        ) : (
          <div className="today-cards">
            {mealList.map((meal) => (
              <article key={meal.id} className="meal-card" aria-label={meal.name}>
                <div>
                  <h3>{meal.name}</h3>
                  <p>{meal.amount}</p>
                  <p>
                    {formatNumber(meal.nutrition.caloriesKcal)} kcal · 蛋白质{' '}
                    {formatNumber(meal.nutrition.proteinGrams)} g · 脂肪{' '}
                    {formatNumber(meal.nutrition.fatGrams)} g · 碳水{' '}
                    {formatNumber(meal.nutrition.carbsGrams)} g
                  </p>
                </div>
                <div className="meal-card-actions">
                  <button type="button" onClick={() => startEdit(meal)}>
                    编辑{meal.name}
                  </button>
                  <button type="button" onClick={() => void copyMeal(meal)}>
                    复制{meal.name}
                  </button>
                  <button type="button" className="danger-action" onClick={() => void deleteMeal(meal)}>
                    删除{meal.name}
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
