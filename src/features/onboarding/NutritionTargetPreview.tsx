import type { NutritionTargets } from '../../domain/nutrition';

interface NutritionTargetPreviewProps {
  targets: NutritionTargets;
}

export function NutritionTargetPreview({ targets }: NutritionTargetPreviewProps) {
  return (
    <section className="target-preview" aria-labelledby="target-preview-title">
      <p className="onboarding-step">第 2 步 · 查看并继续调整</p>
      <h2 id="target-preview-title">每日增肌目标</h2>
      <dl className="target-grid">
        <div>
          <dt>热量</dt>
          <dd>{Math.round(targets.caloriesKcal)} 千卡</dd>
        </div>
        <div>
          <dt>蛋白质</dt>
          <dd>{Math.round(targets.proteinGrams)} 克</dd>
        </div>
        <div>
          <dt>脂肪</dt>
          <dd>{Math.round(targets.fatGrams)} 克</dd>
        </div>
        <div>
          <dt>碳水</dt>
          <dd>{Math.round(targets.carbsGrams)} 克</dd>
        </div>
      </dl>
      <p className="estimate-notice">以上为可编辑估算值，不构成医疗建议。</p>
    </section>
  );
}
