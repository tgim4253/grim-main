import type { SessionPreset } from '../../../shared/types';

type CroquisPresetStepListProps = {
  preset: SessionPreset | null;
};

export function CroquisPresetStepList({ preset }: CroquisPresetStepListProps) {
  if (preset === null) {
    return null;
  }

  return (
    <div className="croquis-step-list">
      {preset.steps.map(step => (
        <div key={step.id} className="croquis-step">
          <div>
            <strong>{step.name}</strong>
            <span>
              {step.autoTags.length > 0
                ? step.autoTags.map(tag => tag.name).join(', ')
                : 'No auto tags'}
            </span>
          </div>
          <span>
            {step.defaultDurationSeconds ? `${String(step.defaultDurationSeconds)}s` : 'Free'}
          </span>
        </div>
      ))}
    </div>
  );
}
