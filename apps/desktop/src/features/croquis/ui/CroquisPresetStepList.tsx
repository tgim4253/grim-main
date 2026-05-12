import { useTranslation } from 'react-i18next';
import type { SessionPreset } from '../../../shared/types';

type CroquisPresetStepListProps = {
  preset: SessionPreset | null;
};

export function CroquisPresetStepList({ preset }: CroquisPresetStepListProps) {
  const { t } = useTranslation('common');

  if (preset === null) {
    return null;
  }

  return (
    <div className="croquis-step-list">
      {preset.steps.map(step => (
        <div key={step.id} className="croquis-step">
          <div>
            <strong>{step.timeStep.name}</strong>
            <span>
              {step.timeStep.autoTags.length > 0
                ? step.timeStep.autoTags.map(tag => tag.name).join(', ')
                : t('croquis.auto_tags.empty', { defaultValue: 'No auto tags' })}
            </span>
          </div>
          <span>
            {step.timeStep.defaultDurationSeconds
              ? `${String(step.timeStep.defaultDurationSeconds)}s`
              : t('croquis.duration.free', { defaultValue: 'Free' })}
          </span>
        </div>
      ))}
    </div>
  );
}
