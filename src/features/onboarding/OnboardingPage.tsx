import { useEffect, useRef, useState } from 'react';

import {
  calculateNutritionTargets,
  nutritionInputsSchema,
  type NutritionTargets,
} from '../../domain/nutrition';
import type { SettingsRepository, TrainingExperience } from '../../platform/settings';
import { NutritionTargetPreview } from './NutritionTargetPreview';
import './onboarding.css';

interface OnboardingPageProps {
  repository: SettingsRepository;
}

type FormValues = {
  age: string;
  sex: string;
  heightCm: string;
  weightKg: string;
  activityLevel: string;
  proteinGramsPerKg: string;
  fatCalorieRatio: string;
  surplusRatio: string;
  trainingDaysPerWeek: string;
  trainingExperience: string;
};

type FieldName = keyof FormValues;
type FieldErrors = Partial<Record<FieldName, string>>;

const initialValues: FormValues = {
  age: '',
  sex: '',
  heightCm: '',
  weightKg: '',
  activityLevel: '',
  proteinGramsPerKg: '1.6',
  fatCalorieRatio: '0.25',
  surplusRatio: '0.1',
  trainingDaysPerWeek: '3',
  trainingExperience: 'beginner',
};

const fieldErrorMessages: Record<FieldName, string> = {
  age: '年龄需在 18 到 100 岁之间',
  sex: '请选择生理性别，或改用手动设置',
  heightCm: '请输入 100 到 250 厘米之间的身高',
  weightKg: '请输入 30 到 350 千克之间的体重',
  activityLevel: '请选择日常活动量',
  proteinGramsPerKg: '蛋白质目标需在每千克 1.6 到 2.2 克之间',
  fatCalorieRatio: '脂肪热量占比需在 0.15 到 0.4 之间',
  surplusRatio: '热量盈余比例需在 0 到 0.3 之间',
  trainingDaysPerWeek: '每周训练天数需为 0 到 7 的整数',
  trainingExperience: '请选择训练经验',
};

function toOptionalNumber(value: string) {
  return value.trim() === '' ? undefined : Number(value);
}

function isFieldName(value: PropertyKey | undefined): value is FieldName {
  return typeof value === 'string' && value in initialValues;
}

export function OnboardingPage({ repository }: OnboardingPageProps) {
  const [values, setValues] = useState(initialValues);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showManualGuidance, setShowManualGuidance] = useState(false);
  const formRevision = useRef(0);

  useEffect(() => {
    let active = true;

    async function restoreDraft() {
      try {
        const draft = await repository.loadDraft();
        if (!active || draft === null) return;

        setValues({
          age: String(draft.inputs.age),
          sex: draft.inputs.sex,
          heightCm: String(draft.inputs.heightCm),
          weightKg: String(draft.inputs.weightKg),
          activityLevel: draft.inputs.activityLevel,
          proteinGramsPerKg: String(draft.inputs.proteinGramsPerKg),
          fatCalorieRatio: String(draft.inputs.fatCalorieRatio),
          surplusRatio: String(draft.inputs.surplusRatio),
          trainingDaysPerWeek: String(draft.trainingDaysPerWeek),
          trainingExperience: draft.trainingExperience,
        });
        setTargets(draft.targets);
      } catch {
        if (active) {
          setDraftMessage('暂时无法恢复草稿，仍可重新填写并计算。');
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void restoreDraft();
    return () => {
      active = false;
    };
  }, [repository]);

  function updateValue(field: FieldName, value: string) {
    formRevision.current += 1;
    setValues((current) => ({ ...current, [field]: value }));
    setTargets(null);
    setDraftMessage(null);
  }

  async function calculateAndSave() {
    if (isSaving) return;

    const calculationRevision = formRevision.current;
    setFieldErrors({});
    setFormErrors([]);
    setDraftMessage(null);

    const result = nutritionInputsSchema.safeParse({
      age: toOptionalNumber(values.age),
      sex: values.sex === '' ? undefined : values.sex,
      heightCm: toOptionalNumber(values.heightCm),
      weightKg: toOptionalNumber(values.weightKg),
      activityLevel: values.activityLevel === '' ? undefined : values.activityLevel,
      proteinGramsPerKg: toOptionalNumber(values.proteinGramsPerKg),
      fatCalorieRatio: toOptionalNumber(values.fatCalorieRatio),
      surplusRatio: toOptionalNumber(values.surplusRatio),
    });

    if (!result.success) {
      const nextFieldErrors: FieldErrors = {};
      const nextFormErrors: string[] = [];
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (isFieldName(field)) {
          nextFieldErrors[field] ??= fieldErrorMessages[field];
        } else {
          nextFormErrors.push(issue.message);
        }
      }
      setFieldErrors(nextFieldErrors);
      setFormErrors(nextFormErrors);
      return;
    }

    const trainingDaysPerWeek = toOptionalNumber(values.trainingDaysPerWeek);
    if (
      trainingDaysPerWeek === undefined ||
      !Number.isInteger(trainingDaysPerWeek) ||
      trainingDaysPerWeek < 0 ||
      trainingDaysPerWeek > 7
    ) {
      setFieldErrors((current) => ({
        ...current,
        trainingDaysPerWeek: fieldErrorMessages.trainingDaysPerWeek,
      }));
      return;
    }
    if (!['beginner', 'intermediate', 'advanced'].includes(values.trainingExperience)) {
      setFieldErrors((current) => ({
        ...current,
        trainingExperience: fieldErrorMessages.trainingExperience,
      }));
      return;
    }

    const nextTargets = calculateNutritionTargets(result.data);
    setTargets(nextTargets);
    setIsSaving(true);
    try {
      await repository.saveDraft({
        inputs: result.data,
        trainingDaysPerWeek,
        trainingExperience: values.trainingExperience as TrainingExperience,
        targets: nextTargets,
      });
      if (formRevision.current === calculationRevision) {
        setDraftMessage('草稿已保存在此设备。');
      }
    } catch {
      if (formRevision.current === calculationRevision) {
        setDraftMessage('目标已计算，但草稿暂时无法保存；可以重试计算。');
      }
    } finally {
      setIsSaving(false);
    }
  }

  const fieldDescription = (field: FieldName) =>
    fieldErrors[field] === undefined ? undefined : `${field}-error`;

  return (
    <main className="onboarding-page">
      <header>
        <p className="onboarding-step">第 1 步 · 基础信息</p>
        <h1>设置你的增肌目标</h1>
        <p>填写基础信息，先得到一组随时可以修改的每日估算值。</p>
      </header>

      {isLoading && <p role="status">正在恢复草稿…</p>}
      {draftMessage && <p className="draft-message" role="status">{draftMessage}</p>}

      <form
        className="onboarding-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void calculateAndSave();
        }}
      >
        <label>
          年龄
          <input
            type="number"
            inputMode="decimal"
            disabled={isLoading}
            value={values.age}
            onChange={(event) => updateValue('age', event.target.value)}
            aria-describedby={fieldDescription('age')}
            aria-invalid={fieldErrors.age !== undefined}
          />
        </label>
        {fieldErrors.age && <span id="age-error" className="field-error">{fieldErrors.age}</span>}

        <label>
          生理性别
          <select
            disabled={isLoading}
            value={values.sex}
            onChange={(event) => updateValue('sex', event.target.value)}
            aria-describedby={fieldDescription('sex')}
            aria-invalid={fieldErrors.sex !== undefined}
          >
            <option value="">请选择</option>
            <option value="male">男性</option>
            <option value="female">女性</option>
          </select>
        </label>
        {fieldErrors.sex && <span id="sex-error" className="field-error">{fieldErrors.sex}</span>}

        <label>
          身高（厘米）
          <input
            type="number"
            inputMode="decimal"
            disabled={isLoading}
            value={values.heightCm}
            onChange={(event) => updateValue('heightCm', event.target.value)}
            aria-describedby={fieldDescription('heightCm')}
            aria-invalid={fieldErrors.heightCm !== undefined}
          />
        </label>
        {fieldErrors.heightCm && <span id="heightCm-error" className="field-error">{fieldErrors.heightCm}</span>}

        <label>
          体重（千克）
          <input
            type="number"
            inputMode="decimal"
            disabled={isLoading}
            value={values.weightKg}
            onChange={(event) => updateValue('weightKg', event.target.value)}
            aria-describedby={fieldDescription('weightKg')}
            aria-invalid={fieldErrors.weightKg !== undefined}
          />
        </label>
        {fieldErrors.weightKg && <span id="weightKg-error" className="field-error">{fieldErrors.weightKg}</span>}

        <label>
          日常活动量
          <select
            disabled={isLoading}
            value={values.activityLevel}
            onChange={(event) => updateValue('activityLevel', event.target.value)}
            aria-describedby={fieldDescription('activityLevel')}
            aria-invalid={fieldErrors.activityLevel !== undefined}
          >
            <option value="">请选择</option>
            <option value="sedentary">久坐或很少运动</option>
            <option value="light">每周轻量运动 1–3 次</option>
            <option value="moderate">每周中等运动 3–5 次</option>
            <option value="high">每周高强度运动 6–7 次</option>
            <option value="veryHigh">高体力工作或高频训练</option>
          </select>
        </label>
        {fieldErrors.activityLevel && <span id="activityLevel-error" className="field-error">{fieldErrors.activityLevel}</span>}

        <label>
          每周训练天数
          <input
            type="number"
            inputMode="numeric"
            disabled={isLoading}
            min="0"
            max="7"
            step="1"
            value={values.trainingDaysPerWeek}
            onChange={(event) => updateValue('trainingDaysPerWeek', event.target.value)}
            aria-describedby={fieldDescription('trainingDaysPerWeek')}
            aria-invalid={fieldErrors.trainingDaysPerWeek !== undefined}
          />
        </label>
        {fieldErrors.trainingDaysPerWeek && <span id="trainingDaysPerWeek-error" className="field-error">{fieldErrors.trainingDaysPerWeek}</span>}

        <label>
          训练经验
          <select
            disabled={isLoading}
            value={values.trainingExperience}
            onChange={(event) => updateValue('trainingExperience', event.target.value)}
            aria-describedby={fieldDescription('trainingExperience')}
            aria-invalid={fieldErrors.trainingExperience !== undefined}
          >
            <option value="">请选择</option>
            <option value="beginner">初级</option>
            <option value="intermediate">中级</option>
            <option value="advanced">高级</option>
          </select>
        </label>
        {fieldErrors.trainingExperience && <span id="trainingExperience-error" className="field-error">{fieldErrors.trainingExperience}</span>}

        <fieldset>
          <legend>可调整参数</legend>
          <label>
            蛋白质（克/千克）
            <input
              type="number"
              inputMode="decimal"
              disabled={isLoading}
              step="0.1"
              value={values.proteinGramsPerKg}
              onChange={(event) => updateValue('proteinGramsPerKg', event.target.value)}
              aria-describedby={fieldDescription('proteinGramsPerKg')}
              aria-invalid={fieldErrors.proteinGramsPerKg !== undefined}
            />
          </label>
          {fieldErrors.proteinGramsPerKg && <span id="proteinGramsPerKg-error" className="field-error">{fieldErrors.proteinGramsPerKg}</span>}
          <label>
            脂肪热量占比
            <input
              type="number"
              inputMode="decimal"
              disabled={isLoading}
              step="0.01"
              value={values.fatCalorieRatio}
              onChange={(event) => updateValue('fatCalorieRatio', event.target.value)}
              aria-describedby={fieldDescription('fatCalorieRatio')}
              aria-invalid={fieldErrors.fatCalorieRatio !== undefined}
            />
          </label>
          {fieldErrors.fatCalorieRatio && <span id="fatCalorieRatio-error" className="field-error">{fieldErrors.fatCalorieRatio}</span>}
          <label>
            热量盈余比例
            <input
              type="number"
              inputMode="decimal"
              disabled={isLoading}
              step="0.01"
              value={values.surplusRatio}
              onChange={(event) => updateValue('surplusRatio', event.target.value)}
              aria-describedby={fieldDescription('surplusRatio')}
              aria-invalid={fieldErrors.surplusRatio !== undefined}
            />
          </label>
          {fieldErrors.surplusRatio && <span id="surplusRatio-error" className="field-error">{fieldErrors.surplusRatio}</span>}
        </fieldset>

        {formErrors.length > 0 && (
          <div className="form-error" role="alert">
            {formErrors.map((error) => <p key={error}>{error}</p>)}
          </div>
        )}

        <button
          className="calculate-button"
          type="submit"
          disabled={isLoading || isSaving}
        >
          {isSaving ? '正在保存…' : '计算增肌目标'}
        </button>
      </form>

      <aside className="special-notice">
        <h2>特殊情况</h2>
        <p>未满 18 岁、孕期、哺乳期，或有代谢及饮食相关疾病时，请先咨询专业人士。</p>
        <button className="manual-button" type="button" onClick={() => setShowManualGuidance(true)}>
          改用手动设置
        </button>
        {showManualGuidance && <p>手动目标将在后续步骤中设置；本页暂不提交最终手动目标。</p>}
      </aside>

      {targets && <NutritionTargetPreview targets={targets} />}
    </main>
  );
}
