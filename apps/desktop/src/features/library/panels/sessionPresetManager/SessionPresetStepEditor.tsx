import { Button, Input } from '../../../../shared/ui';
import type { EditableStep } from './shared';

type SessionPresetStepEditorProps = {
  availableTagNames: string[];
  index: number;
  step: EditableStep;
  stepsCount: number;
  onChange: (nextStep: EditableStep) => void;
  onRemove: () => void;
};

export function SessionPresetStepEditor({
  availableTagNames,
  index,
  step,
  stepsCount,
  onChange,
  onRemove,
}: SessionPresetStepEditorProps) {
  const nextIndex = String(index + 1);

  return (
    <div className="library-step-card library-step-card--editor">
      <div className="library-manager__step-grid">
        <Input
          label={`Step ${nextIndex} name`}
          value={step.name}
          onChange={event => {
            onChange({ ...step, name: event.target.value });
          }}
        />
        <Input
          label="Duration (seconds)"
          type="number"
          min={0}
          value={step.defaultDurationSeconds}
          onChange={event => {
            onChange({ ...step, defaultDurationSeconds: event.target.value });
          }}
        />
      </div>

      <label className="library-check">
        <input
          type="checkbox"
          checked={step.resultRequired}
          onChange={event => {
            onChange({ ...step, resultRequired: event.target.checked });
          }}
        />
        <span>Result asset required</span>
      </label>

      <label className="library-field">
        <span className="library-field__label">Auto tags</span>
        <input
          value={step.autoTagNames}
          onChange={event => {
            onChange({ ...step, autoTagNames: event.target.value });
          }}
          className="library-control"
          placeholder="gesture, memory, correction"
        />
      </label>

      <div className="library-muted-copy">
        Available tags: {availableTagNames.length > 0 ? availableTagNames.join(', ') : 'none'}
      </div>

      <div className="library-inline-actions">
        <Button variant="secondary" size="sm" disabled={stepsCount <= 1} onClick={onRemove}>
          Remove Step
        </Button>
      </div>
    </div>
  );
}
